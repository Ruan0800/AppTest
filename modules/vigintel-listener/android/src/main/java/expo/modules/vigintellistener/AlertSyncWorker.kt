package expo.modules.vigintellistener

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class AlertSyncWorker(
  appContext: Context,
  params: WorkerParameters
) : CoroutineWorker(appContext, params) {
  override suspend fun doWork(): Result {
    val id = inputData.getString(KEY_ID) ?: return Result.failure()
    if (ListenerPrefs.endpointUrl(applicationContext).isBlank()) return Result.retry()
    return try {
      when (AlertDispatcher.deliverStored(applicationContext, id)) {
        DeliveryOutcome.RETRY -> Result.retry()
        DeliveryOutcome.SENT, DeliveryOutcome.DROP -> Result.success()
      }
    } catch (_: Exception) {
      Result.retry()
    }
  }

  companion object {
    const val KEY_ID = "client_alert_id"
  }
}
