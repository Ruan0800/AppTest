package expo.modules.vigintellistener

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class ListenerConfigOptions : Record {
  @Field
  var cooldownMs: Double? = null

  @Field
  var confidenceThreshold: Double? = null

  @Field
  var endpointUrl: String? = null

  @Field
  var accessToken: String? = null
}

class VigintelListenerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VigintelListener")

    Events("onStatusChange", "onDetection")

    OnCreate {
      ListenerBridge.attach(this@VigintelListenerModule)
    }

    OnDestroy {
      ListenerBridge.detach(this@VigintelListenerModule)
    }

    AsyncFunction("start") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val missing = missingPermissions(context)
      if (missing.isNotEmpty()) {
        throw IllegalStateException("Permissões necessárias: ${missing.joinToString(", ")}")
      }
      ListenerPrefs.setEnabled(context, true)
      ListenerService.start(context)
    }

    AsyncFunction("stop") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      ListenerPrefs.setEnabled(context, false)
      ListenerService.stop(context)
    }

    AsyncFunction("recover") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      ListenerService.recover(context)
    }

    AsyncFunction("updateKeywords") { phrases: List<String> ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      ListenerPrefs.setPhrases(context, phrases)
      ListenerService.notifyPhrasesChanged()
      ListenerRuntime.update(
        context,
        ListenerRuntime.status,
        ListenerRuntime.reason,
        ListenerRuntime.partial
      )
    }

    AsyncFunction("getStatus") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      ListenerRuntime.snapshot(context)
    }

    AsyncFunction("configure") { options: ListenerConfigOptions ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      options.cooldownMs?.let { ListenerPrefs.setCooldownMs(context, it.toLong()) }
      options.confidenceThreshold?.let { ListenerPrefs.setConfidence(context, it.toFloat()) }
      val endpointChanged = options.endpointUrl != null || options.accessToken != null
      options.endpointUrl?.let { ListenerPrefs.setEndpointUrl(context, it) }
      options.accessToken?.let { ListenerPrefs.setAccessToken(context, it) }
      if (endpointChanged) AlertDispatcher.enqueuePending(context)
    }

    AsyncFunction("validatePhrases") { phrases: List<String> ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val model = VoskModels.get(context)
      val missing = linkedSetOf<String>()
      val accepted = mutableListOf<String>()
      for (phrase in phrases) {
        val check = Vocabulary.check(model, phrase)
        if (check.missing.isEmpty() && check.grammarPhrase.isNotEmpty()) {
          accepted += check.grammarPhrase
        } else {
          missing += check.missing
        }
      }
      mapOf(
        "ok" to (missing.isEmpty() && accepted.isNotEmpty()),
        "missing" to missing.toList(),
        "phrase" to accepted.joinToString(" ")
      )
    }
  }

  private fun missingPermissions(context: android.content.Context): List<String> {
    val missing = mutableListOf<String>()
    if (!granted(context, Manifest.permission.RECORD_AUDIO)) missing += "RECORD_AUDIO"
    return missing
  }

  private fun granted(context: android.content.Context, permission: String): Boolean {
    return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
  }
}
