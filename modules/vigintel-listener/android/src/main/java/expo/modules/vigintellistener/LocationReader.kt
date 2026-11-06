package expo.modules.vigintellistener

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Looper
import androidx.core.content.ContextCompat
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

internal object LocationReader {
  private const val FRESH_MS = 2 * 60 * 1000L
  private val watchLock = Any()
  private var watching = false
  private val watchers = mutableListOf<LocationListener>()

  fun start(context: Context) {
    val app = context.applicationContext
    val manager = app.getSystemService(LocationManager::class.java) ?: return
    synchronized(watchLock) {
      if (watching) return
      watching = true
    }
    val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
      .filter { provider -> canUse(app, provider) && safeEnabled(manager, provider) }
    for (provider in providers) {
      val listener = LocationListener { }
      try {
        manager.requestLocationUpdates(provider, 4_000L, 0f, listener, Looper.getMainLooper())
        synchronized(watchLock) { watchers += listener }
      } catch (_: Exception) {
        // Provider unavailable.
      }
    }
  }

  fun stop(context: Context) {
    val manager = context.applicationContext.getSystemService(LocationManager::class.java)
    val copy = synchronized(watchLock) {
      watching = false
      watchers.toList().also { watchers.clear() }
    }
    copy.forEach { listener ->
      try {
        manager?.removeUpdates(listener)
      } catch (_: Exception) {
        // Already removed.
      }
    }
  }

  /** Espera um ponto novo. Se já houver um recente, devolve na hora. */
  fun awaitFix(context: Context, timeoutMs: Long): LocationFix? {
    val recent = lastKnown(context)?.takeIf { it.isRecent() }
    if (recent != null) return recent
    val manager = context.getSystemService(LocationManager::class.java) ?: return lastKnown(context)
    val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
      .filter { provider -> canUse(context, provider) && safeEnabled(manager, provider) }
    if (providers.isEmpty()) return lastKnown(context)
    val latch = CountDownLatch(1)
    val fresh = AtomicReference<Location?>(null)
    val listener = LocationListener { location ->
      fresh.set(location)
      latch.countDown()
    }
    try {
      providers.forEach { provider ->
        manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
      }
    } catch (_: Exception) {
      return lastKnown(context)
    }
    try {
      latch.await(timeoutMs, TimeUnit.MILLISECONDS)
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
    } finally {
      try {
        manager.removeUpdates(listener)
      } catch (_: Exception) {
        // Provider already stopped.
      }
    }
    return fresh.get()?.toFix() ?: lastKnown(context)
  }

  private fun LocationFix.isRecent(): Boolean {
    return System.currentTimeMillis() - timeMillis <= FRESH_MS
  }

  fun lastKnown(context: Context): LocationFix? {
    val manager = context.getSystemService(LocationManager::class.java) ?: return null
    val providers = buildList {
      add(LocationManager.GPS_PROVIDER)
      add(LocationManager.NETWORK_PROVIDER)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        add(LocationManager.FUSED_PROVIDER)
      }
    }
    val best = providers.mapNotNull { provider ->
      if (!canUse(context, provider)) return@mapNotNull null
      try {
        manager.getLastKnownLocation(provider)
      } catch (_: SecurityException) {
        null
      }
    }.maxByOrNull { it.time }
    return best?.toFix()
  }

  fun awaitQuick(context: Context, timeoutMs: Long): LocationFix? {
    val cached = lastKnown(context)
    val manager = context.getSystemService(LocationManager::class.java) ?: return cached
    val provider = pickProvider(context, manager) ?: return cached
    val latch = CountDownLatch(1)
    val fresh = AtomicReference<Location?>(null)
    val listener = LocationListener { location ->
      fresh.set(location)
      latch.countDown()
    }
    try {
      manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
    } catch (_: Exception) {
      return cached
    }
    try {
      latch.await(timeoutMs, TimeUnit.MILLISECONDS)
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
    } finally {
      try {
        manager.removeUpdates(listener)
      } catch (_: Exception) {
        // The provider may already be gone.
      }
    }
    val update = fresh.get()?.toFix()
    return when {
      update == null -> cached
      cached == null -> update
      else -> update
    }
  }

  private fun pickProvider(context: Context, manager: LocationManager): String? {
    val fine = has(context, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarse = has(context, Manifest.permission.ACCESS_COARSE_LOCATION)
    if (!fine && !coarse) return null
    if (fine && safeEnabled(manager, LocationManager.GPS_PROVIDER)) return LocationManager.GPS_PROVIDER
    if (safeEnabled(manager, LocationManager.NETWORK_PROVIDER)) return LocationManager.NETWORK_PROVIDER
    return null
  }

  private fun canUse(context: Context, provider: String): Boolean {
    val fine = has(context, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarse = has(context, Manifest.permission.ACCESS_COARSE_LOCATION)
    return when (provider) {
      LocationManager.GPS_PROVIDER -> fine
      else -> fine || coarse
    }
  }

  private fun safeEnabled(manager: LocationManager, provider: String): Boolean {
    return try {
      manager.isProviderEnabled(provider)
    } catch (_: Exception) {
      false
    }
  }

  private fun has(context: Context, permission: String): Boolean {
    return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
  }

  private fun Location.toFix(): LocationFix {
    return LocationFix(
      latitude = latitude,
      longitude = longitude,
      accuracy = if (hasAccuracy()) accuracy.toDouble() else null,
      timeMillis = time
    )
  }
}
