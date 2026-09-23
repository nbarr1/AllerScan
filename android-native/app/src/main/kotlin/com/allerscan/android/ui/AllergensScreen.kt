package com.allerscan.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.allerscan.core.data.AllergenDatabase
import com.allerscan.core.model.AllergenCategory
import com.allerscan.core.model.SeverityLevel
import com.allerscan.core.model.UserProfile

private val AllergenCategory.title: String
    get() = when (this) {
        AllergenCategory.TREE -> "Trees"
        AllergenCategory.GRASS -> "Grasses"
        AllergenCategory.WEED -> "Weeds"
        AllergenCategory.MOLD -> "Molds"
        AllergenCategory.INDOOR -> "Indoor"
    }

private val SeverityLevel.label: String
    get() = name.lowercase().replaceFirstChar { it.uppercase() }

@Composable
fun AllergensScreen(
    profile: UserProfile,
    onSeverity: (String, SeverityLevel?) -> Unit,
    onAddCustom: (String, AllergenCategory, SeverityLevel) -> Unit,
    onRemoveCustom: (String) -> Unit,
) {
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            FootnoteText("Pick a severity for each allergen you react to. Tap the selected severity again to remove it.")
        }
        AllergenDatabase.byCategory().forEach { (category, allergens) ->
            item(key = "header-$category") {
                Text(category.title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp))
            }
            items(allergens, key = { it.id }) { allergen ->
                AllergenRow(
                    name = allergen.name,
                    detail = "${allergen.scientificName} · ${allergen.season}",
                    selected = profile.allergens[allergen.id],
                    onSelect = { onSeverity(allergen.id, it) },
                )
            }
        }

        item(key = "custom-header") {
            Text("Your own triggers", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp))
        }
        items(profile.customAllergens.entries.toList(), key = { it.key }) { (id, meta) ->
            AllergenRow(
                name = meta.name,
                detail = "Custom · scored with the ${meta.category.name.lowercase()} index",
                selected = profile.allergens[id],
                onSelect = { severity -> if (severity == null) onRemoveCustom(id) else onSeverity(id, severity) },
                trailing = {
                    IconButton(onClick = { onRemoveCustom(id) }) {
                        Icon(Icons.Filled.Delete, contentDescription = "Remove ${meta.name}")
                    }
                },
            )
        }
        item(key = "custom-form") { AddCustomAllergen(onAddCustom) }
    }
}

@Composable
private fun AllergenRow(
    name: String,
    detail: String,
    selected: SeverityLevel?,
    onSelect: (SeverityLevel?) -> Unit,
    trailing: @Composable () -> Unit = {},
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(name, style = MaterialTheme.typography.bodyLarge)
                FootnoteText(detail)
            }
            trailing()
        }
        SeverityChips(selected, onSelect)
        HorizontalDivider(Modifier.padding(top = 8.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SeverityChips(selected: SeverityLevel?, onSelect: (SeverityLevel?) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SeverityLevel.entries.forEach { level ->
            FilterChip(
                selected = selected == level,
                onClick = { onSelect(if (selected == level) null else level) },
                label = { Text(level.label) },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddCustomAllergen(onAdd: (String, AllergenCategory, SeverityLevel) -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf(AllergenCategory.TREE) }
    var severity by rememberSaveable { mutableStateOf(SeverityLevel.MODERATE) }

    Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = name,
            onValueChange = { name = it.take(UserProfile.MAX_CUSTOM_NAME_LENGTH) },
            label = { Text("Trigger name, such as Olive tree") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AllergenCategory.entries.forEach { option ->
                FilterChip(selected = category == option, onClick = { category = option }, label = { Text(option.title) })
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SeverityLevel.entries.forEach { option ->
                FilterChip(selected = severity == option, onClick = { severity = option }, label = { Text(option.label) })
            }
        }
        Button(
            onClick = {
                onAdd(name, category, severity)
                name = ""
            },
            enabled = name.isNotBlank(),
        ) { Text("Add trigger") }
    }
}
