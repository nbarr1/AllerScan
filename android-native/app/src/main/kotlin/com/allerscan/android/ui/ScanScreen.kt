package com.allerscan.android.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.allerscan.android.ui.theme.color
import com.allerscan.core.model.RiskLevel
import com.allerscan.core.model.SeverityLevel
import java.io.File

@Composable
fun ScanScreen(scan: ScanState, onPhoto: (Uri) -> Unit, onClear: () -> Unit) {
    val context = LocalContext.current
    var pendingCaptureUri by rememberSaveable { mutableStateOf<Uri?>(null) }
    var launchError by rememberSaveable { mutableStateOf<String?>(null) }

    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val uri = pendingCaptureUri
        if (saved && uri != null) onPhoto(uri)
    }
    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) onPhoto(uri)
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            "Photograph a plant, tree, weed or mold. The AllerScan server identifies it and checks it against your saved allergens.",
            style = MaterialTheme.typography.bodyMedium,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = {
                launchError = null
                val uri = newCaptureUri(context)
                pendingCaptureUri = uri
                try {
                    takePicture.launch(uri)
                } catch (_: ActivityNotFoundException) {
                    launchError = "No camera app is available. Choose a photo instead."
                }
            }) {
                Icon(Icons.Filled.CameraAlt, contentDescription = null, Modifier.padding(end = 8.dp))
                Text("Take photo")
            }
            OutlinedButton(onClick = {
                launchError = null
                pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            }) {
                Icon(Icons.Filled.PhotoLibrary, contentDescription = null, Modifier.padding(end = 8.dp))
                Text("Choose photo")
            }
        }
        launchError?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        when (scan) {
            ScanState.Idle -> Unit
            is ScanState.Analyzing -> {
                scan.preview?.let { Preview(it) }
                Text(if (scan.preview == null) "Preparing the photo…" else "Identifying…")
                LinearProgressIndicator(Modifier.fillMaxWidth())
            }
            is ScanState.Failed -> {
                scan.preview?.let { Preview(it) }
                SectionCard("The photo wasn't identified") {
                    Text(scan.message)
                    TextButton(onClick = onClear) { Text("Dismiss") }
                }
            }
            is ScanState.Identified -> {
                Preview(scan.preview)
                Result(scan)
                TextButton(onClick = onClear) { Text("Clear") }
            }
        }
    }
}

@Composable
private fun Preview(bitmap: android.graphics.Bitmap) {
    Image(
        bitmap = bitmap.asImageBitmap(),
        contentDescription = "The photo being scanned",
        contentScale = ContentScale.Crop,
        modifier = Modifier.fillMaxWidth().heightIn(max = 280.dp).clip(RoundedCornerShape(12.dp)),
    )
}

@Composable
private fun Result(scan: ScanState.Identified) {
    val result = scan.result
    val match = scan.match
    SectionCard(result.speciesName) {
        if (result.scientificName.isNotBlank()) {
            Text(result.scientificName, style = MaterialTheme.typography.bodyMedium, fontStyle = FontStyle.Italic)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val category = result.allergenCategory?.name?.lowercase() ?: result.category.ifBlank { "unknown" }.replace('_', ' ')
            LevelBadge(category.replaceFirstChar { it.uppercase() }, MaterialTheme.colorScheme.primary)
            // Only shown when the model reported one; a filled-in default would read as a measurement.
            result.confidence?.let { LevelBadge("$it% confidence", MaterialTheme.colorScheme.secondary) }
        }
        if (match != null) {
            val color = when (match.severity) {
                SeverityLevel.MILD -> RiskLevel.MODERATE.color()
                SeverityLevel.MODERATE -> RiskLevel.HIGH.color()
                SeverityLevel.SEVERE -> RiskLevel.VERY_HIGH.color()
            }
            LevelBadge("Matches your allergen: ${match.allergenName} (${match.severity.name.lowercase()})", color)
        } else {
            Text("Not one of your saved allergens.")
        }
        if (result.details.isNotBlank()) Text(result.details)
        if (result.identifyingFeatures.isNotEmpty()) {
            Text("Identifying features", style = MaterialTheme.typography.titleSmall)
            result.identifyingFeatures.forEach { Text("• $it") }
        }
        FootnoteText("AI identification can be wrong. Don't rely on it for medical decisions.")
    }
}

/** A fresh file in the cache for the camera app to write into, shared through the FileProvider. */
private fun newCaptureUri(context: Context): Uri {
    val dir = File(context.cacheDir, "scans").apply { mkdirs() }
    // Keep only the latest capture; older ones have already been sent or abandoned.
    dir.listFiles()?.forEach { it.delete() }
    val file = File(dir, "scan-${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}
