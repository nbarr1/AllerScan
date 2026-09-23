package com.allerscan.android.util

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

/** A photo ready to send to `/api/scan`, plus the decoded bitmap to show beside the result. */
class PreparedPhoto(val jpeg: ByteArray, val preview: Bitmap)

object ImageUtils {
    /** Matches the web app, which downscales photos to 1600 px before sending them. */
    private const val MAX_EDGE_PX = 1600
    private const val JPEG_QUALITY = 85

    /**
     * Decodes the photo at [uri], applying its EXIF rotation, downscales it and re-encodes it as
     * JPEG. Blocking; call it off the main thread.
     */
    fun prepare(resolver: ContentResolver, uri: Uri): PreparedPhoto {
        val source = ImageDecoder.createSource(resolver, uri)
        val bitmap = ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
            val longest = max(info.size.width, info.size.height)
            if (longest > MAX_EDGE_PX) {
                val scale = MAX_EDGE_PX.toFloat() / longest
                decoder.setTargetSize(
                    (info.size.width * scale).roundToInt().coerceAtLeast(1),
                    (info.size.height * scale).roundToInt().coerceAtLeast(1),
                )
            }
            // Software bitmaps can be re-encoded; hardware ones can't be read back on every device.
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
        return PreparedPhoto(out.toByteArray(), bitmap)
    }
}
