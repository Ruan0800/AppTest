package expo.modules.vigintellistener

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.text.SimpleDateFormat
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import java.util.TimeZone

internal data class StoredAlert(
  val clientAlertId: String,
  val phrase: String,
  val createdAt: String,
  val latitude: Double?,
  val longitude: Double?,
  val accuracy: Double?,
  val confidence: Double,
  val syncStatus: String
)

internal data class LocationFix(
  val latitude: Double,
  val longitude: Double,
  val accuracy: Double?,
  val timeMillis: Long = 0L
)

internal data class EmergencyContact(
  val name: String,
  val phone: String,
  val telegramChatId: String?
)

internal object AlertStore {
  private const val DB_NAME = "escuta_alertas.db"
  private val lock = Any()

  fun sqliteNow(): String {
    return OffsetDateTime.now(ZoneId.systemDefault())
      .truncatedTo(ChronoUnit.SECONDS)
      .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
  }

  fun deviceTimeZoneId(): String = ZoneId.systemDefault().id

  /** Instant do alerta. Formato antigo sem fuso é UTC. */
  fun createdAtMillis(createdAt: String): Long? {
    val value = createdAt.trim()
    if (value.isEmpty()) return null
    return try {
      if (value.contains('T')) {
        OffsetDateTime.parse(value).toInstant().toEpochMilli()
      } else {
        val format = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
        format.timeZone = TimeZone.getTimeZone("UTC")
        format.parse(value)?.time
      }
    } catch (_: Exception) {
      try {
        Instant.parse(value).toEpochMilli()
      } catch (_: Exception) {
        null
      }
    }
  }

  fun insert(
    context: Context,
    clientAlertId: String,
    phrase: String,
    confidence: Float,
    location: LocationFix?,
    createdAt: String
  ) {
    synchronized(lock) {
      writable(context).use { db ->
        ensureSchema(db)
        db.compileStatement(
          """
          INSERT INTO alerts (
            trigger, matched_word, notified, created_at,
            client_alert_id, latitude, longitude, accuracy, confidence, sync_status
          ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, 'pending')
          """.trimIndent()
        ).use { statement ->
          statement.bindString(1, "voice")
          statement.bindString(2, phrase)
          statement.bindString(3, createdAt)
          statement.bindString(4, clientAlertId)
          bindDouble(statement, 5, location?.latitude)
          bindDouble(statement, 6, location?.longitude)
          bindDouble(statement, 7, location?.accuracy)
          statement.bindDouble(8, confidence.toDouble())
          statement.executeInsert()
        }
      }
    }
  }

  fun updateLocation(context: Context, clientAlertId: String, location: LocationFix) {
    synchronized(lock) {
      writable(context).use { db ->
        db.compileStatement(
          "UPDATE alerts SET latitude=?, longitude=?, accuracy=? WHERE client_alert_id=?"
        ).use { statement ->
          statement.bindDouble(1, location.latitude)
          statement.bindDouble(2, location.longitude)
          bindDouble(statement, 3, location.accuracy)
          statement.bindString(4, clientAlertId)
          statement.executeUpdateDelete()
        }
      }
    }
  }

  fun markSent(context: Context, clientAlertId: String) {
    synchronized(lock) {
      writable(context).use { db ->
        db.execSQL(
          "UPDATE alerts SET sync_status='sent', error=NULL WHERE client_alert_id=?",
          arrayOf(clientAlertId)
        )
      }
    }
  }

  fun markDropped(context: Context, clientAlertId: String, message: String) {
    synchronized(lock) {
      writable(context).use { db ->
        db.execSQL(
          "UPDATE alerts SET sync_status='dropped', error=? WHERE client_alert_id=?",
          arrayOf(message.take(500), clientAlertId)
        )
      }
    }
  }

  fun markError(context: Context, clientAlertId: String, message: String) {
    synchronized(lock) {
      writable(context).use { db ->
        db.execSQL(
          "UPDATE alerts SET sync_status='pending', error=? WHERE client_alert_id=?",
          arrayOf(message.take(500), clientAlertId)
        )
      }
    }
  }

  fun isSent(context: Context, clientAlertId: String): Boolean {
    return load(context, clientAlertId)?.syncStatus == "sent"
  }

  fun load(context: Context, clientAlertId: String): StoredAlert? {
    synchronized(lock) {
      writable(context).use { db ->
        ensureSchema(db)
        db.rawQuery(
          """
          SELECT client_alert_id, matched_word, created_at, latitude, longitude,
                 accuracy, confidence, sync_status
          FROM alerts WHERE client_alert_id=? LIMIT 1
          """.trimIndent(),
          arrayOf(clientAlertId)
        ).use { cursor ->
          if (!cursor.moveToFirst()) return null
          return StoredAlert(
            clientAlertId = cursor.getString(0),
            phrase = cursor.getString(1) ?: "",
            createdAt = cursor.getString(2) ?: "",
            latitude = cursor.getDoubleOrNull(3),
            longitude = cursor.getDoubleOrNull(4),
            accuracy = cursor.getDoubleOrNull(5),
            confidence = if (cursor.isNull(6)) 0.0 else cursor.getDouble(6),
            syncStatus = cursor.getString(7) ?: "pending"
          )
        }
      }
    }
  }

  fun contacts(context: Context): List<EmergencyContact> {
    synchronized(lock) {
      writable(context).use { db ->
        val exists = db.rawQuery(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='contacts'",
          null
        ).use { it.moveToFirst() }
        if (!exists) return emptyList()
        val hasTelegram = columnExists(db, "contacts", "telegram_chat_id")
        val sql = if (hasTelegram) {
          "SELECT name, phone, telegram_chat_id FROM contacts"
        } else {
          "SELECT name, phone, NULL FROM contacts"
        }
        db.rawQuery(sql, null).use { cursor ->
          val rows = mutableListOf<EmergencyContact>()
          while (cursor.moveToNext()) {
            val name = cursor.getString(0)?.trim().orEmpty()
            val phone = cursor.getString(1)?.trim().orEmpty()
            val telegram = cursor.getString(2)?.trim()?.ifEmpty { null }
            if (name.isEmpty() && phone.isEmpty() && telegram == null) continue
            rows += EmergencyContact(name, phone, telegram)
          }
          return rows
        }
      }
    }
  }

  fun pendingIds(context: Context): List<String> {
    synchronized(lock) {
      writable(context).use { db ->
        ensureSchema(db)
        db.rawQuery(
          """
          SELECT client_alert_id FROM alerts
          WHERE sync_status='pending' AND client_alert_id IS NOT NULL
          """.trimIndent(),
          null
        ).use { cursor ->
          val ids = mutableListOf<String>()
          while (cursor.moveToNext()) {
            cursor.getString(0)?.let { ids += it }
          }
          return ids
        }
      }
    }
  }

  private fun columnExists(db: SQLiteDatabase, table: String, column: String): Boolean {
    db.rawQuery("PRAGMA table_info($table)", null).use { cursor ->
      val nameIndex = cursor.getColumnIndex("name")
      while (cursor.moveToNext()) {
        if (nameIndex >= 0 && cursor.getString(nameIndex) == column) return true
      }
    }
    return false
  }

  private fun bindDouble(statement: android.database.sqlite.SQLiteStatement, index: Int, value: Double?) {
    if (value == null) statement.bindNull(index) else statement.bindDouble(index, value)
  }

  private fun android.database.Cursor.getDoubleOrNull(index: Int): Double? {
    return if (isNull(index)) null else getDouble(index)
  }

  private fun writable(context: Context): SQLiteDatabase {
    val file = databaseFile(context)
    file.parentFile?.mkdirs()
    return SQLiteDatabase.openOrCreateDatabase(file, null).also { db ->
      db.enableWriteAheadLogging()
    }
  }

  private fun databaseFile(context: Context): File {
    return File(context.filesDir, "SQLite/$DB_NAME")
  }

  private fun ensureSchema(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger TEXT NOT NULL,
        matched_word TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        notified INTEGER NOT NULL DEFAULT 0,
        client_alert_id TEXT,
        latitude REAL,
        longitude REAL,
        accuracy REAL,
        confidence REAL,
        sync_status TEXT,
        error TEXT
      )
      """.trimIndent()
    )
    val existing = mutableSetOf<String>()
    db.rawQuery("PRAGMA table_info(alerts)", null).use { cursor ->
      val nameIndex = cursor.getColumnIndex("name")
      while (cursor.moveToNext()) {
        if (nameIndex >= 0) existing += cursor.getString(nameIndex)
      }
    }
    val columns = listOf(
      "client_alert_id" to "TEXT",
      "latitude" to "REAL",
      "longitude" to "REAL",
      "accuracy" to "REAL",
      "confidence" to "REAL",
      "sync_status" to "TEXT",
      "error" to "TEXT"
    )
    for ((name, type) in columns) {
      if (name !in existing) {
        db.execSQL("ALTER TABLE alerts ADD COLUMN $name $type")
      }
    }
    db.execSQL(
      "CREATE UNIQUE INDEX IF NOT EXISTS alerts_client_alert_id ON alerts(client_alert_id) WHERE client_alert_id IS NOT NULL"
    )
  }
}
