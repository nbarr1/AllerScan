package com.allerscan.android.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.allerscan.core.model.UserProfile

private val SENSITIVITY_OPTIONS = listOf(
    Triple(1, "Less reactive", "Symptoms start later than most people"),
    Triple(2, "Typical", "React around the usual thresholds"),
    Triple(3, "Highly reactive", "Symptoms start at lower pollen levels"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(state: AppUiState, viewModel: AppViewModel) {
    val context = LocalContext.current
    val requestLocation = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) viewModel.useDeviceLocation()
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SectionCard("Location") {
            Text((state.profile.location ?: UserProfile.DEFAULT_LOCATION).displayName)
            if (state.profile.location == null) FootnoteText("Default location. Search for yours, or use this device's position.")
            OutlinedButton(
                enabled = !state.locating,
                onClick = {
                    val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                        PackageManager.PERMISSION_GRANTED
                    if (granted) viewModel.useDeviceLocation() else requestLocation.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
                },
            ) {
                if (state.locating) {
                    CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Filled.MyLocation, contentDescription = null)
                }
                Text("Use my location", Modifier.padding(start = 8.dp))
            }
            OutlinedTextField(
                value = state.locationSearch.query,
                onValueChange = viewModel::onLocationQueryChange,
                label = { Text("Search for a city") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            if (state.locationSearch.searching) FootnoteText("Searching…")
            state.locationSearch.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            state.locationSearch.results.forEach { city ->
                Text(
                    city.displayName,
                    Modifier.fillMaxWidth().clickable { viewModel.selectLocation(city) }.padding(vertical = 10.dp),
                )
            }
        }

        SectionCard("Reaction sensitivity") {
            FootnoteText("Scales your personal risk score. Typical leaves it unchanged.")
            SENSITIVITY_OPTIONS.forEach { (value, label, description) ->
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    FilterChip(
                        selected = state.profile.sensitivityFactor == value,
                        onClick = { viewModel.setSensitivity(value) },
                        label = { Text(label) },
                    )
                    Text(description, Modifier.padding(start = 12.dp), style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        ServerCard(state.serverUrl, onSave = viewModel::setServerUrl)

        SectionCard("About") {
            Text(
                "AllerScan is for personal environmental tracking only. It isn't a medical device and doesn't " +
                    "diagnose or treat allergies."
            )
            FootnoteText(
                "Your allergen profile is stored on this device. It's sent to the AllerScan server only to " +
                    "score each report, with your location rounded to about 1 km."
            )
        }
    }
}

@Composable
private fun ServerCard(current: String, onSave: (String) -> Boolean) {
    var draft by rememberSaveable(current) { mutableStateOf(current) }
    var invalid by rememberSaveable { mutableStateOf(false) }
    SectionCard("AllerScan server") {
        FootnoteText("The server that holds the API keys and computes reports. Run it with npm run dev, or use a deployed HTTPS address.")
        OutlinedTextField(
            value = draft,
            onValueChange = {
                draft = it
                invalid = false
            },
            label = { Text("Server address") },
            singleLine = true,
            isError = invalid,
            supportingText = { if (invalid) Text("Enter an http:// or https:// address.") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth(),
        )
        TextButton(enabled = draft.trim() != current, onClick = { invalid = !onSave(draft) }) { Text("Save") }
    }
}
