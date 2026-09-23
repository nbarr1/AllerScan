package com.allerscan.android.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import com.allerscan.core.model.RiskLevel

private val Emerald = Color(0xFF059669)
private val EmeraldLight = Color(0xFF34D399)

private val LightColors = lightColorScheme(
    primary = Emerald,
    secondary = Color(0xFF0F766E),
    background = Color(0xFFF8FAFC),
    surface = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = EmeraldLight,
    secondary = Color(0xFF5EEAD4),
    background = Color(0xFF090D16),
    surface = Color(0xFF111827),
)

/** The web app's severity colors (src/utils/severity.ts), so a level reads the same everywhere. */
fun RiskLevel?.color(): Color = when (this) {
    RiskLevel.LOW -> Color(0xFF10B981)
    RiskLevel.MODERATE -> Color(0xFFEAB308)
    RiskLevel.HIGH -> Color(0xFFF97316)
    RiskLevel.VERY_HIGH -> Color(0xFFE11D48)
    null -> Color(0xFF94A3B8)
}

@Composable
fun AllerScanTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val colors = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColors
        else -> LightColors
    }
    MaterialTheme(colorScheme = colors, content = content)
}
