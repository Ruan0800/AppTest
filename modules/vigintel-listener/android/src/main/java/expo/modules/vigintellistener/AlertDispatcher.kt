package expo.modules.vigintellistener

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

internal enum class DeliveryOutcome {
  SENT,
  RETRY,
  DROP
}

internal object AlertDispatcher {
  private const val TAG = "VigintelListener"
  private const val MAX_DELIVERY_AGE_MS = 3 * 60 * 1000L
  private val http = OkHttpClient.Builder()
    .connectTimeout(8, TimeUnit.SECONDS)
    .readTimeout(8, TimeUnit.SECONDS)
    .writeTimeout(8, TimeUnit.SECONDS)
    .build()
  private val cooldownLock = Any()

  fun handle(context: Context, phrase: String, confidence: Float) {
    val app = context.applicationContext
    val now = System.currentTimeMillis()
    synchronized(cooldownLock) {
      val cooldown = ListenerPrefs.cooldownMs(app)
      if (now - ListenerPrefs.lastTriggerAt(app) < cooldown) return
      ListenerPrefs.setLastTriggerAt(app, now)
    }

    val id = UUID.randomUUID().toString()
    val createdAt = AlertStore.sqliteNow()
    val initial = LocationReader.lastKnown(app)
    AlertStore.insert(app, id, phrase, confidence, initial, createdAt)
    ListenerBridge.emitDetection(
      mapOf(
        "clientAlertId" to id,
        "phrase" to phrase,
        "confidence" to confidence.toDouble(),
        "createdAt" to createdAt
      )
    )
    Log.i(TAG, "Alert saved id=$id")

    val location = LocationReader.awaitFix(app, 12_000) ?: initial
    if (location == null) {
      AlertStore.markError(app, id, "Localização ainda indisponível")
      enqueue(app, id)
      return
    }
    AlertStore.updateLocation(app, id, location)
    deliver(app, id, phrase, confidence.toDouble(), createdAt, location, scheduleRetry = true)
  }

  fun deliverStored(context: Context, clientAlertId: String): DeliveryOutcome {
    val row = AlertStore.load(context, clientAlertId) ?: return DeliveryOutcome.SENT
    if (row.syncStatus == "sent") return DeliveryOutcome.SENT
    val stored = if (row.latitude != null && row.longitude != null) {
      LocationFix(row.latitude, row.longitude, row.accuracy)
    } else {
      null
    }
    val location = stored ?: LocationReader.awaitFix(context, 12_000)
    if (location == null) return DeliveryOutcome.RETRY
    if (stored == null) AlertStore.updateLocation(context, row.clientAlertId, location)
    return deliver(
      context,
      row.clientAlertId,
      row.phrase,
      row.confidence,
      row.createdAt,
      location,
      scheduleRetry = false
    )
  }

  fun enqueuePending(context: Context) {
    if (ListenerPrefs.endpointUrl(context).isBlank()) return
    AlertStore.pendingIds(context).forEach { id ->
      val row = AlertStore.load(context, id)
      if (row != null && expired(row.createdAt)) {
        AlertStore.markDropped(context, id, "Alerta antigo descartado")
      } else {
        enqueue(context, id)
      }
    }
  }

  private fun expired(createdAt: String): Boolean {
    val at = AlertStore.createdAtMillis(createdAt) ?: return false
    return System.currentTimeMillis() - at > MAX_DELIVERY_AGE_MS
  }

  private fun deliver(
    context: Context,
    id: String,
    phrase: String,
    confidence: Double,
    createdAt: String,
    location: LocationFix?,
    scheduleRetry: Boolean
  ): DeliveryOutcome {
    if (expired(createdAt)) {
      AlertStore.markDropped(context, id, "Alerta antigo descartado")
      return DeliveryOutcome.DROP
    }
    if (location == null) {
      AlertStore.markError(context, id, "Localização ainda indisponível")
      if (scheduleRetry) enqueue(context, id)
      return DeliveryOutcome.RETRY
    }
    val url = ListenerPrefs.endpointUrl(context)
    if (url.isBlank()) {
      AlertStore.markError(context, id, "Endpoint do alerta não configurado")
      if (scheduleRetry) enqueue(context, id)
      return DeliveryOutcome.RETRY
    }
    return try {
      when (val outcome = post(context, url, id, phrase, confidence, createdAt, location)) {
        DeliveryOutcome.SENT -> {
          AlertStore.markSent(context, id)
          DeliveryOutcome.SENT
        }
        DeliveryOutcome.DROP -> {
          AlertStore.markError(context, id, "Servidor recusou o alerta")
          DeliveryOutcome.DROP
        }
        DeliveryOutcome.RETRY -> {
          AlertStore.markError(context, id, "Envio pendente de rede")
          if (scheduleRetry) enqueue(context, id)
          DeliveryOutcome.RETRY
        }
      }
    } catch (error: Exception) {
      Log.w(TAG, "Alert post failed", error)
      AlertStore.markError(context, id, error.message ?: "falha de rede")
      if (scheduleRetry) enqueue(context, id)
      DeliveryOutcome.RETRY
    }
  }

  private fun post(
    context: Context,
    url: String,
    id: String,
    phrase: String,
    confidence: Double,
    createdAt: String,
    location: LocationFix?
  ): DeliveryOutcome {
    val contacts = JSONArray()
    AlertStore.contacts(context).forEach { contact ->
      contacts.put(
        JSONObject()
          .put("name", contact.name)
          .put("phone", contact.phone)
          .put("telegram_chat_id", contact.telegramChatId ?: JSONObject.NULL)
      )
    }
    val payload = JSONObject()
      .put("client_alert_id", id)
      .put("phrase", phrase)
      .put("confidence", confidence)
      .put("created_at", createdAt)
      .put("time_zone", AlertStore.deviceTimeZoneId())
      .put("latitude", location?.latitude ?: JSONObject.NULL)
      .put("longitude", location?.longitude ?: JSONObject.NULL)
      .put("accuracy", location?.accuracy ?: JSONObject.NULL)
      .put("contacts", contacts)
    val body = payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
    val builder = Request.Builder().url(url).post(body)
    val token = ListenerPrefs.accessToken(context)
    if (token.isNotBlank()) builder.header("Authorization", "Bearer $token")
    http.newCall(builder.build()).execute().use { response ->
      val code = response.code
      return when {
        response.isSuccessful || code == 409 -> DeliveryOutcome.SENT
        code == 408 || code == 429 || code >= 500 -> DeliveryOutcome.RETRY
        else -> DeliveryOutcome.DROP
      }
    }
  }

  private fun enqueue(context: Context, clientAlertId: String) {
    val request = OneTimeWorkRequestBuilder<AlertSyncWorker>()
      .setInputData(workDataOf(AlertSyncWorker.KEY_ID to clientAlertId))
      .setConstraints(
        Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
      )
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
      .build()
    WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
      "vigintel-alert-$clientAlertId",
      ExistingWorkPolicy.KEEP,
      request
    )
  }
}
