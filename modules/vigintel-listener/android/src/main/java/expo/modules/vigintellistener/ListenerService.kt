package expo.modules.vigintellistener

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.media.AudioRecordingConfiguration
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors

class ListenerService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null
  private var pipeline: AudioPipeline? = null
  private var recordingCallback: AudioManager.AudioRecordingCallback? = null
  private val alerts = Executors.newSingleThreadExecutor()

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    phrasesListener = { pipeline?.markPhrasesChanged() }
    val enabled = ListenerPrefs.isEnabled(this) || intent?.action == ACTION_START
    val stopping = intent?.action == ACTION_STOP || !enabled
    try {
      startForegroundNotification()
    } catch (error: Exception) {
      Log.e(TAG, "Unable to promote the listening service", error)
      ListenerPrefs.setEnabled(this, false)
      ListenerRuntime.update(this, "error", "permission", null)
      stopSelf()
      return START_NOT_STICKY
    }

    if (intent?.action == ACTION_RECOVER) {
      if (!ListenerPrefs.isEnabled(this)) {
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        return START_NOT_STICKY
      }
      acquireWakeLock()
      registerMicCallback()
      LocationReader.start(this)
      ensurePipeline()
      return START_STICKY
    }

    if (stopping) {
      ListenerPrefs.setEnabled(this, false)
      shutdown()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      ListenerRuntime.update(this, "idle", null, null)
      return START_NOT_STICKY
    }

    ListenerPrefs.setEnabled(this, true)
    acquireWakeLock()
    registerMicCallback()
    LocationReader.start(this)
    ensurePipeline()
    return START_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    if (ListenerPrefs.isEnabled(this)) {
      scheduleRestart()
    }
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    val failed = ListenerRuntime.status == "error"
    phrasesListener = null
    unregisterMicCallback()
    shutdown()
    if (!failed) ListenerRuntime.update(this, "idle", null, null)
    super.onDestroy()
  }

  private fun ensurePipeline() {
    val current = pipeline
    if (current != null && current.isAlive()) {
      current.setMicrophoneBusy(microphoneTaken())
      ListenerRuntime.update(this, ListenerRuntime.status, ListenerRuntime.reason)
      return
    }
    current?.stop()
    pipeline = null
    ListenerRuntime.update(this, "starting", null, null)
    val created = AudioPipeline(
      applicationContext,
      micTaken = { microphoneTaken() },
      onStatus = { status, reason ->
        ListenerRuntime.update(this, status, reason, if (status == "listening") "" else ListenerRuntime.partial)
      },
      onPartial = { partial ->
        ListenerRuntime.update(this, "listening", ListenerRuntime.reason, partial)
      },
      onDetection = { phrase, confidence ->
        alerts.execute {
          try {
            AlertDispatcher.handle(this, phrase, confidence)
          } catch (error: Exception) {
            Log.e(TAG, "Failed to record alert", error)
          }
        }
      }
    )
    pipeline = created
    created.setMicrophoneBusy(microphoneTaken())
    created.start()
  }

  private fun shutdown() {
    pipeline?.stop()
    pipeline = null
    LocationReader.stop(this)
    releaseWakeLock()
    alerts.shutdown()
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val power = getSystemService(PowerManager::class.java) ?: return
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "vigintel:listener").apply {
      setReferenceCounted(false)
      acquire()
    }
  }

  private fun releaseWakeLock() {
    try {
      if (wakeLock?.isHeld == true) wakeLock?.release()
    } catch (_: RuntimeException) {
      // Already released.
    }
    wakeLock = null
  }

  private fun startForegroundNotification() {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager?.deleteNotificationChannel("vigintel_protection")
      manager?.deleteNotificationChannel("listening")
      manager?.deleteNotificationChannel("alerts-v2")
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Vigintel",
        NotificationManager.IMPORTANCE_LOW
      )
      channel.setSound(null, null)
      channel.enableVibration(false)
      channel.enableLights(false)
      channel.setShowBadge(false)
      channel.lockscreenVisibility = Notification.VISIBILITY_SECRET
      manager?.createNotificationChannel(channel)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      manager?.activeNotifications?.forEach { status ->
        if (status.id != NOTIFICATION_ID) manager?.cancel(status.tag, status.id)
      }
    }

    // O Android exige um objeto de notificação para manter microfone e
    // localização em segundo plano. Ele fica sem texto, sem som e sem vibração.
    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_vigintel_status)
      .setOngoing(true)
      .setSilent(true)
      .setShowWhen(false)
      .setOnlyAlertOnce(true)
      .setLocalOnly(true)
      .setVisibility(NotificationCompat.VISIBILITY_SECRET)
      .setCategory(Notification.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
        ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
      startForeground(NOTIFICATION_ID, notification, serviceType)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun registerMicCallback() {
    if (recordingCallback != null) return
    val audio = getSystemService(AudioManager::class.java) ?: return
    val callback = object : AudioManager.AudioRecordingCallback() {
      override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
        val busy = configs.any { config ->
          val owner = clientPackage(config)
          owner != null && owner != packageName
        }
        pipeline?.setMicrophoneBusy(busy)
        if (busy) {
          ListenerRuntime.update(this@ListenerService, "paused", "microphone_busy")
        }
      }
    }
    audio.registerAudioRecordingCallback(callback, null)
    recordingCallback = callback
  }

  private fun unregisterMicCallback() {
    val callback = recordingCallback ?: return
    val audio = getSystemService(AudioManager::class.java) ?: return
    audio.unregisterAudioRecordingCallback(callback)
    recordingCallback = null
  }

  private fun microphoneTaken(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
    val audio = getSystemService(AudioManager::class.java) ?: return false
    return audio.activeRecordingConfigurations.any { config ->
      val owner = clientPackage(config)
      owner != null && owner != packageName
    }
  }

  private fun clientPackage(config: AudioRecordingConfiguration): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
    return try {
      val method = AudioRecordingConfiguration::class.java.getMethod("getClientPackageName")
      method.invoke(config) as? String
    } catch (_: Exception) {
      null
    }
  }

  private fun scheduleRestart() {
    val restart = Intent(this, ListenerService::class.java).setAction(ACTION_ENSURE)
    val pending = PendingIntent.getService(
      this,
      71,
      restart,
      PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
    )
    val alarm = getSystemService(AlarmManager::class.java) ?: return
    val at = System.currentTimeMillis() + 1_000
    alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
  }

  companion object {
    private const val TAG = "VigintelListener"
    private const val CHANNEL_ID = "vigintel_runtime"
    private const val NOTIFICATION_ID = 7101
    const val ACTION_START = "expo.modules.vigintellistener.START"
    const val ACTION_STOP = "expo.modules.vigintellistener.STOP"
    const val ACTION_ENSURE = "expo.modules.vigintellistener.ENSURE"
    const val ACTION_RECOVER = "expo.modules.vigintellistener.RECOVER"

    fun start(context: Context) {
      val intent = Intent(context, ListenerService::class.java).setAction(ACTION_START)
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, ListenerService::class.java))
    }

    fun recover(context: Context) {
      if (!ListenerPrefs.isEnabled(context)) return
      val intent = Intent(context, ListenerService::class.java).setAction(ACTION_RECOVER)
      ContextCompat.startForegroundService(context, intent)
    }

    @Volatile
    var phrasesListener: (() -> Unit)? = null

    fun notifyPhrasesChanged() {
      phrasesListener?.invoke()
    }
  }
}
