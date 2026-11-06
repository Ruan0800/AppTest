package expo.modules.vigintellistener

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray

internal object ListenerPrefs {
  private const val FILE = "vigintel_listener"
  private const val KEY_ENABLED = "protection_enabled"
  private const val KEY_PHRASES = "phrases"
  private const val KEY_COOLDOWN = "cooldown_ms"
  private const val KEY_CONFIDENCE = "confidence"
  private const val KEY_ENDPOINT = "endpoint_url"
  private const val KEY_TOKEN = "access_token"
  private const val KEY_LAST_TRIGGER = "last_trigger_at"

  const val DEFAULT_COOLDOWN_MS = 15_000L
  const val DEFAULT_CONFIDENCE = 0.7f

  private fun prefs(context: Context): SharedPreferences {
    val app = context.applicationContext
    return try {
      val masterKey = MasterKey.Builder(app)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
      EncryptedSharedPreferences.create(
        app,
        FILE,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
      )
    } catch (_: Exception) {
      app.getSharedPreferences(FILE, Context.MODE_PRIVATE)
    }
  }

  fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, false)

  fun setEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
  }

  fun phrases(context: Context): List<String> {
    val raw = prefs(context).getString(KEY_PHRASES, null) ?: return emptyList()
    return try {
      val array = JSONArray(raw)
      buildList {
        for (index in 0 until array.length()) {
          val phrase = array.optString(index).trim()
          if (phrase.isNotEmpty()) add(phrase)
        }
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  fun setPhrases(context: Context, phrases: List<String>) {
    val array = JSONArray()
    phrases.map { it.trim() }.filter { it.isNotEmpty() }.distinct().forEach { array.put(it) }
    prefs(context).edit().putString(KEY_PHRASES, array.toString()).apply()
  }

  fun cooldownMs(context: Context): Long =
    prefs(context).getLong(KEY_COOLDOWN, DEFAULT_COOLDOWN_MS).coerceIn(1_000L, 3_600_000L)

  fun setCooldownMs(context: Context, value: Long) {
    prefs(context).edit().putLong(KEY_COOLDOWN, value.coerceIn(1_000L, 3_600_000L)).apply()
  }

  fun confidence(context: Context): Float =
    prefs(context).getFloat(KEY_CONFIDENCE, DEFAULT_CONFIDENCE).coerceIn(0.05f, 0.99f)

  fun setConfidence(context: Context, value: Float) {
    prefs(context).edit().putFloat(KEY_CONFIDENCE, value.coerceIn(0.05f, 0.99f)).apply()
  }

  fun endpointUrl(context: Context): String = prefs(context).getString(KEY_ENDPOINT, "") ?: ""

  fun setEndpointUrl(context: Context, value: String) {
    prefs(context).edit().putString(KEY_ENDPOINT, value.trim()).apply()
  }

  fun accessToken(context: Context): String = prefs(context).getString(KEY_TOKEN, "") ?: ""

  fun setAccessToken(context: Context, value: String) {
    prefs(context).edit().putString(KEY_TOKEN, value).apply()
  }

  fun lastTriggerAt(context: Context): Long = prefs(context).getLong(KEY_LAST_TRIGGER, 0L)

  fun setLastTriggerAt(context: Context, value: Long) {
    prefs(context).edit().putLong(KEY_LAST_TRIGGER, value).apply()
  }
}
