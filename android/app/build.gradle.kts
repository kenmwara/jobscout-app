plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "trade.tbot.jobscout"
    compileSdk = 36

    defaultConfig {
        applicationId = "trade.tbot.jobscout"
        minSdk = 26
        targetSdk = 36
        // Play rejects any upload whose versionCode is not higher than the last —
        // Codemagic's BUILD_NUMBER only ever goes up, so it IS the versionCode.
        versionCode = System.getenv("BUILD_NUMBER")?.toIntOrNull() ?: 1
        versionName = "0.9.7"
    }

    // Codemagic injects CM_KEYSTORE_* from the `android_signing` reference in
    // codemagic.yaml. Absent (a local or debug build) the config is empty and
    // only assembleRelease/bundleRelease would notice.
    signingConfigs {
        create("release") {
            System.getenv("CM_KEYSTORE_PATH")?.let { ks ->
                storeFile = file(ks)
                storePassword = System.getenv("CM_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("CM_KEY_ALIAS")
                keyPassword = System.getenv("CM_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true   // BuildConfig.VERSION_NAME feeds the update check
    }

    /* The UI contract is checked on the JVM, not on a device. The Compose screens
       are graded against the mockup's own structure, and this machine can run
       neither an emulator (the hypervisor driver needs admin) nor adb to the
       phone. Robolectric renders Compose off-device, so the check runs anywhere
       Gradle does — including CI, for free. */
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
        }
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.10.01"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.13")
    testImplementation("androidx.test.ext:junit:1.2.1")
    testImplementation(platform("androidx.compose:compose-bom:2024.10.01"))
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
