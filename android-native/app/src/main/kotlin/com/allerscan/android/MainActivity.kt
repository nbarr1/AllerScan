package com.allerscan.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.allerscan.android.ui.AllerScanApp
import com.allerscan.android.ui.AppViewModel
import com.allerscan.android.ui.theme.AllerScanTheme

class MainActivity : ComponentActivity() {
    private val viewModel: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AllerScanTheme {
                AllerScanApp(viewModel)
            }
        }
    }
}
