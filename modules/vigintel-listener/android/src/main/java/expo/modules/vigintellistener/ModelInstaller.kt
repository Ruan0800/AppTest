package expo.modules.vigintellistener

import android.content.Context
import java.io.File

/**
 * The packaged Portuguese model is a flat Kaldi folder. Vosk expects the
 * standard layout (am/, conf/, graph/, ivector/).
 */
internal object ModelInstaller {
  private const val ASSET_ROOT = "model-small-pt"

  fun install(context: Context): File {
    val dest = File(context.filesDir, "vosk/model-small-pt")
    val marker = File(dest, ".installed")
    val stamp = assetStamp(context)
    if (
      marker.isFile &&
      marker.readText() == stamp &&
      File(dest, "am/final.mdl").isFile &&
      File(dest, "conf/model.conf").isFile
    ) {
      return dest
    }

    if (dest.exists()) dest.deleteRecursively()
    dest.mkdirs()

    val top = context.assets.list(ASSET_ROOT)?.toSet().orEmpty()
    if (top.isEmpty()) {
      throw IllegalStateException(
        "Modelo Vosk não encontrado no app. Confirme assets/model-small-pt e gere o build de novo."
      )
    }

    if (top.contains("am") || top.contains("graph")) {
      copyTree(context, ASSET_ROOT, dest)
    } else {
      copyFlat(context, dest)
    }

    val modelConf = File(dest, "conf/model.conf")
    if (!modelConf.isFile) {
      modelConf.parentFile?.mkdirs()
      modelConf.writeText(DEFAULT_MODEL_CONF)
    }

    if (!File(dest, "am/final.mdl").isFile || !File(dest, "graph/HCLr.fst").isFile) {
      throw IllegalStateException("O modelo Vosk foi copiado incompleto.")
    }

    marker.writeText(stamp)
    return dest
  }

  private const val DEFAULT_MODEL_CONF = """
--min-active=200
--max-active=7000
--beam=13.0
--lattice-beam=6.0
--acoustic-scale=1.0
--frame-subsampling-factor=3
--endpoint.silence-phones=1:2:3:4:5:6:7:8:9:10
--endpoint.rule2.min-trailing-silence=0.5
--endpoint.rule3.min-trailing-silence=1.0
--endpoint.rule4.min-trailing-silence=2.0
"""

  private fun assetStamp(context: Context): String {
    return try {
      context.assets.open("$ASSET_ROOT/uuid").bufferedReader().use { it.readText().trim() }
    } catch (_: Exception) {
      "flat-v1"
    }
  }

  private fun copyFlat(context: Context, dest: File) {
    copyFile(context, "$ASSET_ROOT/final.mdl", File(dest, "am/final.mdl"))
    copyFile(context, "$ASSET_ROOT/mfcc.conf", File(dest, "conf/mfcc.conf"))
    copyFile(context, "$ASSET_ROOT/Gr.fst", File(dest, "graph/Gr.fst"))
    copyFile(context, "$ASSET_ROOT/HCLr.fst", File(dest, "graph/HCLr.fst"))
    copyFile(context, "$ASSET_ROOT/disambig_tid.int", File(dest, "graph/disambig_tid.int"))
    copyFile(context, "$ASSET_ROOT/word_boundary.int", File(dest, "graph/phones/word_boundary.int"))
    val phones = File(dest, "graph/phones/phones.txt")
    if (assetExists(context, "$ASSET_ROOT/phones.txt")) {
      copyFile(context, "$ASSET_ROOT/phones.txt", phones)
    }
    copyTree(context, "$ASSET_ROOT/ivector", File(dest, "ivector"))
  }

  private fun assetExists(context: Context, path: String): Boolean {
    return try {
      context.assets.open(path).close()
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun copyFile(context: Context, assetPath: String, dest: File) {
    dest.parentFile?.mkdirs()
    context.assets.open(assetPath).use { input ->
      dest.outputStream().use { output -> input.copyTo(output) }
    }
  }

  private fun copyTree(context: Context, assetPath: String, dest: File) {
    val children = context.assets.list(assetPath)
    if (children.isNullOrEmpty()) {
      copyFile(context, assetPath, dest)
      return
    }
    dest.mkdirs()
    for (child in children) {
      copyTree(context, "$assetPath/$child", File(dest, child))
    }
  }
}
