package expo.modules.vigintellistener

import android.content.Context
import com.sun.jna.NativeLibrary
import org.vosk.LibVosk
import org.vosk.LogLevel
import org.vosk.Model
import java.text.Normalizer
import java.util.Locale

internal object VoskModels {
  private val lock = Any()
  private var model: Model? = null

  fun get(context: Context): Model {
    synchronized(lock) {
      model?.let { return it }
      val dir = ModelInstaller.install(context.applicationContext)
      LibVosk.setLogLevel(LogLevel.WARNINGS)
      val created = Model(dir.absolutePath)
      model = created
      return created
    }
  }
}

internal object Vocabulary {
  data class Check(val grammarPhrase: String, val missing: List<String>)

  fun normalize(raw: String): String {
    val lower = raw.lowercase(Locale.ROOT).trim()
    val stripped = Normalizer.normalize(lower, Normalizer.Form.NFD)
      .replace(Regex("\\p{M}+"), "")
    return stripped
      .replace(Regex("[^a-z0-9\\s]"), " ")
      .replace(Regex("\\s+"), " ")
      .trim()
  }

  fun check(model: Model, phrase: String): Check {
    val tokens = normalize(phrase).split(' ').filter { it.isNotEmpty() }
    if (tokens.isEmpty()) return Check("", listOf(phrase.ifBlank { "(vazia)" }))

    val missing = mutableListOf<String>()
    for (token in tokens) {
      if (findWord(model, token) <= 0) missing += token
    }
    return Check(tokens.joinToString(" "), missing)
  }

  private fun findWord(model: Model, word: String): Int {
    val pointer = model.pointer
      ?: throw IllegalStateException("O modelo Vosk não expôs o ponteiro nativo.")
    val function = NativeLibrary.getInstance("vosk").getFunction("vosk_model_find_word")
    return function.invokeInt(arrayOf(pointer, word))
  }
}
