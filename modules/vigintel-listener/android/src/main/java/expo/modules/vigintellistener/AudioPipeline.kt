package expo.modules.vigintellistener

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import com.konovalov.vad.webrtc.VadWebRTC
import com.konovalov.vad.webrtc.config.FrameSize
import com.konovalov.vad.webrtc.config.Mode
import com.konovalov.vad.webrtc.config.SampleRate
import org.json.JSONArray
import org.json.JSONObject
import org.vosk.Recognizer
import java.util.ArrayDeque

internal class AudioPipeline(
  private val appContext: android.content.Context,
  private val micTaken: () -> Boolean,
  private val onStatus: (status: String, reason: String?) -> Unit,
  private val onPartial: (String) -> Unit,
  private val onDetection: (phrase: String, confidence: Float) -> Unit
) {
  @Volatile private var running = false
  @Volatile private var microphoneBusy = false
  @Volatile private var phrasesDirty = true

  private val lock = Object()
  private var thread: Thread? = null
  private var recorder: AudioRecord? = null

  fun start() {
    if (thread?.isAlive == true) return
    running = true
    phrasesDirty = true
    thread = Thread({ loop() }, "vigintel-audio").also { it.start() }
  }

  fun isAlive(): Boolean = thread?.isAlive == true

  fun stop() {
    running = false
    synchronized(lock) { lock.notifyAll() }
    releaseRecorder()
    thread?.join(1500)
    thread = null
  }

  fun setMicrophoneBusy(busy: Boolean) {
    microphoneBusy = busy
    if (busy) releaseRecorder()
    synchronized(lock) { lock.notifyAll() }
  }

  fun markPhrasesChanged() {
    phrasesDirty = true
  }

  @SuppressLint("MissingPermission")
  private fun loop() {
    while (running) {
      var vad: VadWebRTC? = null
      var recognizer: Recognizer? = null
      try {
        runSession(
          onVad = { vad = it },
          onRecognizer = { recognizer = it }
        )
      } catch (error: Exception) {
        Log.e(TAG, "Audio pipeline failed", error)
        if (running) onStatus("paused", "audio")
      } finally {
        recognizer?.close()
        recognizer = null
        vad?.close()
        releaseRecorder()
      }
      if (!running) break
      try {
        Thread.sleep(500)
      } catch (_: InterruptedException) {
        break
      }
    }
  }

  @SuppressLint("MissingPermission")
  private fun runSession(
    onVad: (VadWebRTC) -> Unit,
    onRecognizer: (Recognizer?) -> Unit
  ) {
    val vad = VadWebRTC(
      sampleRate = SampleRate.SAMPLE_RATE_16K,
      frameSize = FrameSize.FRAME_SIZE_480,
      mode = Mode.AGGRESSIVE,
      speechDurationMs = 50,
      silenceDurationMs = 300
    )
    onVad(vad)
    var recognizer: Recognizer? = null
    val prebuffer = ArrayDeque<ByteArray>(PRE_BUFFER_FRAMES)
    var speaking = false
    var speechFrames = 0
    var partialTick = 0
    var healthy = false
    val frame = ByteArray(FRAME_BYTES)
    while (running) {
        if (microphoneBusy || micTaken()) {
          microphoneBusy = true
          speaking = false
          speechFrames = 0
          prebuffer.clear()
          recognizer?.reset()
          healthy = false
          onStatus("paused", "microphone_busy")
          synchronized(lock) {
            while (running && microphoneBusy) {
              lock.wait(1000)
              if (!micTaken()) microphoneBusy = false
            }
          }
          if (!running) break
          onStatus("listening", null)
          continue
        }

        if (phrasesDirty) {
          phrasesDirty = false
          recognizer?.close()
          recognizer = openRecognizer()
          onRecognizer(recognizer)
          speaking = false
          speechFrames = 0
          partialTick = 0
          healthy = false
        }

        val record = ensureRecorder()
        if (record == null) {
          healthy = false
          onStatus("error", "audio")
          synchronized(lock) { lock.wait(1000) }
          continue
        }

        val read = try {
          record.read(frame, 0, frame.size)
        } catch (_: Exception) {
          -1
        }
        if (!running) break
        if (microphoneBusy) continue
        if (read < 0) {
          healthy = false
          releaseRecorder()
          onStatus("paused", "microphone_busy")
          synchronized(lock) { lock.wait(400) }
          continue
        }
        if (read < frame.size) continue
        if (!healthy) {
          healthy = true
          onStatus("listening", null)
        }

        val chunk = frame.copyOf(read)
        val heardSpeech = vad.isSpeech(chunk)
        if (heardSpeech && !speaking) {
          recognizer?.let { engine ->
            for (previous in prebuffer) feed(engine, previous)
          }
          speechFrames = 0
        }
        if (heardSpeech) {
          speaking = true
          speechFrames += 1
          recognizer?.let { engine ->
            feed(engine, chunk)
            partialTick += 1
            if (partialTick >= 8) {
              partialTick = 0
              publishPartial(engine.partialResult)
            }
          }
          if (speechFrames >= MAX_SPEECH_FRAMES) {
            finishUtterance(recognizer)
            speaking = false
            speechFrames = 0
            partialTick = 0
          }
        } else if (speaking) {
          finishUtterance(recognizer)
          speaking = false
          speechFrames = 0
          partialTick = 0
        }

        prebuffer.addLast(chunk)
        while (prebuffer.size > PRE_BUFFER_FRAMES) prebuffer.removeFirst()
    }
  }

  private fun openRecognizer(): Recognizer? {
    val phrases = ListenerPrefs.phrases(appContext)
    if (phrases.isEmpty()) {
      onStatus("listening", "no_phrases")
      return null
    }
    val model = VoskModels.get(appContext)
    val grammar = JSONArray()
    var accepted = 0
    for (phrase in phrases) {
      val check = Vocabulary.check(model, phrase)
      if (check.missing.isEmpty() && check.grammarPhrase.isNotEmpty()) {
        grammar.put(check.grammarPhrase)
        accepted += 1
      }
    }
    if (accepted == 0) {
      onStatus("listening", "no_valid_phrases")
      return null
    }
    grammar.put("[unk]")
    val recognizer = Recognizer(model, SAMPLE_RATE.toFloat(), grammar.toString())
    recognizer.setWords(true)
    recognizer.setPartialWords(true)
    onStatus("listening", null)
    return recognizer
  }

  private fun feed(recognizer: Recognizer, bytes: ByteArray) {
    if (recognizer.acceptWaveForm(bytes, bytes.size)) {
      consider(recognizer.result)
      recognizer.reset()
    }
  }

  private fun finishUtterance(recognizer: Recognizer?) {
    val engine = recognizer ?: return
    consider(engine.finalResult)
    engine.reset()
  }

  private fun consider(json: String) {
    val parsed = try {
      JSONObject(json)
    } catch (_: Exception) {
      return
    }
    val text = Vocabulary.normalize(parsed.optString("text"))
    if (text.isEmpty() || text == "unk" || text.contains("unk")) return
    val words = parsed.optJSONArray("result") ?: return
    var minConfidence = 1f
    val heard = mutableListOf<String>()
    for (index in 0 until words.length()) {
      val word = words.optJSONObject(index) ?: continue
      val token = Vocabulary.normalize(word.optString("word"))
      if (token.isEmpty() || token == "unk") return
      heard += token
      minConfidence = minOf(minConfidence, word.optDouble("conf", 0.0).toFloat())
    }
    val spoken = heard.joinToString(" ")
    if (spoken != text) return
    val threshold = ListenerPrefs.confidence(appContext)
    if (minConfidence < threshold) return
    val stored = ListenerPrefs.phrases(appContext).firstOrNull {
      Vocabulary.normalize(it) == spoken
    } ?: return
    onPartial("")
    onDetection(stored, minConfidence)
    phrasesDirty = true
  }

  private fun publishPartial(json: String) {
    val partial = try {
      Vocabulary.normalize(JSONObject(json).optString("partial"))
    } catch (_: Exception) {
      ""
    }
    if (partial.isEmpty() || partial == "unk") return
    onPartial(partial)
  }

  @SuppressLint("MissingPermission")
  private fun ensureRecorder(): AudioRecord? {
    val current = recorder
    if (current != null && current.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
      return current
    }
    releaseRecorder()
    val sources = intArrayOf(
      MediaRecorder.AudioSource.VOICE_RECOGNITION,
      MediaRecorder.AudioSource.MIC
    )
    for (source in sources) {
      val created = openRecorder(source)
      if (created != null) {
        recorder = created
        return created
      }
    }
    return null
  }

  @SuppressLint("MissingPermission")
  private fun openRecorder(source: Int): AudioRecord? {
    var created: AudioRecord? = null
    try {
      val minBuffer = AudioRecord.getMinBufferSize(
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      )
      if (minBuffer <= 0) {
        Log.e(TAG, "getMinBufferSize failed: $minBuffer")
        return null
      }
      val bufferSize = maxOf(minBuffer, FRAME_BYTES * 8)
      created = AudioRecord.Builder()
        .setAudioSource(source)
        .setAudioFormat(
          AudioFormat.Builder()
            .setSampleRate(SAMPLE_RATE)
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
            .build()
        )
        .setBufferSizeInBytes(bufferSize)
        .build()
      if (created.state != AudioRecord.STATE_INITIALIZED) {
        Log.e(TAG, "AudioRecord source $source did not initialize")
        created.release()
        return null
      }
      created.startRecording()
      if (created.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
        Log.e(TAG, "AudioRecord source $source did not start recording")
        created.release()
        return null
      }
      return created
    } catch (error: Exception) {
      Log.e(TAG, "AudioRecord source $source failed", error)
      try {
        created?.release()
      } catch (_: Exception) {
        // Ignore a recorder the system already released.
      }
      return null
    }
  }

  private fun releaseRecorder() {
    val current = recorder
    recorder = null
    if (current == null) return
    try {
      if (current.recordingState == AudioRecord.RECORDSTATE_RECORDING) current.stop()
    } catch (_: Exception) {
      // Already stopped by the recording callback.
    }
    try {
      current.release()
    } catch (_: Exception) {
      // Ignore a recorder that the system already released.
    }
  }

  private companion object {
    const val TAG = "VigintelListener"
    const val SAMPLE_RATE = 16_000
    const val FRAME_SAMPLES = 480
    const val FRAME_BYTES = FRAME_SAMPLES * 2
    const val PRE_BUFFER_FRAMES = 10
    const val MAX_SPEECH_FRAMES = 400
  }
}
