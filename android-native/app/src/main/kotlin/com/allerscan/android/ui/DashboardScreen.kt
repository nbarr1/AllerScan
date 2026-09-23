package com.allerscan.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.allerscan.android.ui.theme.color
import com.allerscan.core.model.EnvironmentalData
import com.allerscan.core.model.PollenCategoryScore
import com.allerscan.core.model.RiskLevel
import com.allerscan.core.model.ScoreBasis
import kotlin.math.roundToInt

@Composable
fun DashboardScreen(state: AppUiState, onRefresh: () -> Unit, onEditAllergens: () -> Unit) {
    when (val dashboard = state.dashboard) {
        DashboardState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        is DashboardState.Failed -> Column(
            Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Couldn't load today's report", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.size(8.dp))
            Text(dashboard.message, style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.size(16.dp))
            Button(onClick = onRefresh) { Text("Try again") }
        }
        is DashboardState.Loaded -> Report(dashboard.data, hasAllergens = state.profile.allergens.isNotEmpty(), onRefresh, onEditAllergens)
    }
}

@Composable
private fun Report(data: EnvironmentalData, hasAllergens: Boolean, onRefresh: () -> Unit, onEditAllergens: () -> Unit) {
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { ScoreCard(data, onRefresh) }

        if (!hasAllergens) {
            item {
                SectionCard("Personalize your score") {
                    Text("Add the allergens you react to, and the score weighs today's readings by them.")
                    TextButton(onClick = onEditAllergens) { Text("Choose allergens") }
                }
            }
        }

        item {
            SectionCard("Pollen today") {
                PollenRow("Tree", data.pollen.tree)
                PollenRow("Grass", data.pollen.grass)
                PollenRow("Weed", data.pollen.weed)
                PollenRow("Mold", data.pollen.mold)
                data.pollenDataSource?.let {
                    FootnoteText(if (data.pollenIsModeled) "Estimated: $it" else "Source: $it")
                }
            }
        }

        if (data.matchedActiveAllergens.isNotEmpty() || data.unscoredAllergens.isNotEmpty()) {
            item {
                SectionCard("Your allergens") {
                    data.matchedActiveAllergens.forEach { match ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(match.name, Modifier.weight(1f))
                            LevelBadge(match.currentLevel.label, match.currentLevel.color())
                        }
                    }
                    data.unscoredAllergens.forEach { unscored ->
                        Row(Modifier.fillMaxWidth()) {
                            Text(unscored.name, Modifier.weight(1f))
                            FootnoteText(if (unscored.reason == "indoor") "Indoor, not scored" else "No reading today")
                        }
                    }
                }
            }
        }

        if (data.aqi != null || data.weather != null) {
            item {
                SectionCard("Air and weather") {
                    data.aqi?.let { Text("Air quality index ${it.aqi} (${it.category})") }
                    data.weather?.let {
                        Text("${it.temperatureF.roundToInt()} °F, ${it.weatherDescription}")
                        Text("Humidity ${it.humidityPct.roundToInt()}%, wind ${it.windSpeedMph.roundToInt()} mph ${it.windDirection}")
                    }
                    data.dataSource?.let { FootnoteText("Source: $it") }
                }
            }
        }

        item {
            SectionCard("Forecast") {
                if (data.forecast.isEmpty()) {
                    Text("No live pollen forecast covers this location.")
                } else {
                    data.forecast.forEach { day ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(day.dayName, Modifier.width(96.dp), fontWeight = FontWeight.Medium)
                            Text(day.dominantAllergen, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                            LevelBadge("${day.overallScore}", day.riskLevel.color())
                        }
                    }
                    data.forecastSource?.let { FootnoteText("Source: $it") }
                }
            }
        }

        if (data.recommendations.isNotEmpty()) {
            item {
                SectionCard("Recommendations") {
                    data.recommendations.forEach { Text("• $it") }
                }
            }
        }

        item {
            FootnoteText(
                "AllerScan is for personal environmental tracking only and isn't a medical device. " +
                    "It doesn't diagnose or treat allergies; talk to your doctor or allergist about symptoms."
            )
        }
    }
}

@Composable
private fun ScoreCard(data: EnvironmentalData, onRefresh: () -> Unit) {
    SectionCard(data.locationName) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    "${data.overallPersonalRiskScore}",
                    style = MaterialTheme.typography.displayMedium,
                    color = data.riskCategory.color(),
                    modifier = Modifier.semantics {
                        contentDescription = "Risk score ${data.overallPersonalRiskScore} out of 100, ${data.riskCategory.label}"
                    },
                )
                LevelBadge(data.riskCategory.label, data.riskCategory.color())
            }
            IconButton(onClick = onRefresh) { Icon(Icons.Filled.Refresh, contentDescription = "Refresh") }
        }
        FootnoteText(
            when (data.scoreBasis) {
                ScoreBasis.PROFILE -> "Personal risk, weighted by your saved allergens."
                ScoreBasis.GENERAL -> "General outdoor risk: none of your saved allergens could be scored."
            }
        )
        FootnoteText("Updated ${data.updatedAt}${data.timeZoneAbbr?.let { " $it" }.orEmpty()}")
        data.timeZoneNote?.let { FootnoteText(it) }
    }
}

@Composable
private fun PollenRow(label: String, score: PollenCategoryScore) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(label, Modifier.weight(1f), fontWeight = FontWeight.Medium)
            val value = score.value
            if (value == null) {
                FootnoteText("No reading")
            } else {
                val level = score.level ?: RiskLevel.forScore(value)
                LevelBadge("$value · ${level.label}", level.color())
            }
        }
        score.value?.let { value ->
            val level = score.level ?: RiskLevel.forScore(value)
            LinearProgressIndicator(
                progress = { value.coerceIn(0, 100) / 100f },
                modifier = Modifier.fillMaxWidth(),
                color = level.color(),
            )
        }
        if (score.topSpecies.isNotEmpty()) FootnoteText(score.topSpecies.joinToString())
        score.estimateNote?.let { FootnoteText(it) }
    }
}
