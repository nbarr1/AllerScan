package com.allerscan.android.util

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import androidx.core.content.ContextCompat
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

object LocationHelper {
    private const val FIX_TIMEOUT_MS = 15_000L
    private const val MAX_LAST_KNOWN_AGE_MS = 30 * 60 * 1000L

    /**
     * A coarse position from the platform location service, or null when none is available.
     * The caller must hold ACCESS_COARSE_LOCATION.
     */
    @SuppressLint("MissingPermission")
    suspend fun currentLocation(context: Context): Location? {
        val manager = context.getSystemService(LocationManager::class.java) ?: return null
        val providers = manager.getProviders(true)
        val recent = providers
            .mapNotNull { manager.getLastKnownLocation(it) }
            .filter { System.currentTimeMillis() - it.time < MAX_LAST_KNOWN_AGE_MS }
            .maxByOrNull { it.time }
        if (recent != null) return recent

        val provider = when {
            LocationManager.NETWORK_PROVIDER in providers -> LocationManager.NETWORK_PROVIDER
            LocationManager.GPS_PROVIDER in providers -> LocationManager.GPS_PROVIDER
            else -> return null
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return manager.getLastKnownLocation(provider)
        }
        return withTimeoutOrNull(FIX_TIMEOUT_MS) {
            suspendCancellableCoroutine { continuation ->
                val signal = CancellationSignal()
                continuation.invokeOnCancellation { signal.cancel() }
                manager.getCurrentLocation(provider, signal, ContextCompat.getMainExecutor(context)) { location ->
                    continuation.resume(location)
                }
            }
        }
    }
}
