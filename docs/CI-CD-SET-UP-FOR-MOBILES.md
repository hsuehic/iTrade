# Mobile CI/CD Setup Guide

This document covers everything you need to configure before the
`.github/workflows/mobile-release.yml` pipeline can build and publish the iOS and
Android apps automatically.

The workflow triggers whenever a commit on `main` changes the `version:` field in
`apps/mobile/pubspec.yaml`. Both platforms build in parallel — Android on an
Ubuntu runner, iOS on a macOS runner (required for Xcode).

---

## Table of Contents

1. [How the pipeline works](#1-how-the-pipeline-works)
2. [GitHub Secrets overview](#2-github-secrets-overview)
3. [Android setup](#3-android-setup)
   - 3.1 [Export your release keystore](#31-export-your-release-keystore)
   - 3.2 [Create a Google Play service account](#32-create-a-google-play-service-account)
4. [iOS setup](#4-ios-setup)
   - 4.1 [Export your Distribution certificate](#41-export-your-distribution-certificate)
   - 4.2 [Download your provisioning profile](#42-download-your-provisioning-profile)
   - 4.3 [Create an App Store Connect API key](#43-create-an-app-store-connect-api-key)
5. [Add secrets to GitHub](#5-add-secrets-to-github)
6. [Running the workflow](#6-running-the-workflow)
7. [After the build](#7-after-the-build)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. How the pipeline works

```
push to main
  └─ apps/mobile/pubspec.yaml changed?
       └─ detect-version job
            ├─ version: field changed vs HEAD~1?  ──No──▶ stop (skip both builds)
            └─ Yes
                 ├─ build-android  (ubuntu-latest)
                 │    ├─ flutter build appbundle --release
                 │    └─ upload AAB → Google Play (internal track, draft)
                 └─ build-ios  (macos-latest, Xcode 16)
                      ├─ flutter build ipa --release
                      └─ upload IPA → App Store Connect (TestFlight)
```

The two build jobs run in parallel. Either can fail independently without blocking
the other. Artifacts (AAB and IPA) are also retained as workflow artifacts for
14 days so you can download them manually if needed.

> **macOS runners** — GitHub provides hosted macOS runners (`macos-latest` = macOS 14
> Sonoma, Apple Silicon M1, Xcode 16). They are available with no extra setup but
> consume minutes at a higher rate than Linux runners. iOS builds cannot run anywhere
> else because Xcode is macOS-only.

---

## 2. GitHub Secrets overview

All credentials are stored as **repository secrets** (never committed to source
control). The table below lists every secret the workflow reads.

| Secret name                        | Used by | Description                                              |
| ---------------------------------- | ------- | -------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`          | Android | Base64-encoded release keystore file                     |
| `ANDROID_KEYSTORE_PASSWORD`        | Android | `storePassword` for the keystore                         |
| `ANDROID_KEY_ALIAS`                | Android | Key alias inside the keystore                            |
| `ANDROID_KEY_PASSWORD`             | Android | Password for the key alias                               |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Android | GCP service account JSON with Play API access            |
| `IOS_CERTIFICATE_BASE64`           | iOS     | Base64-encoded Apple Distribution certificate (.p12)     |
| `IOS_CERTIFICATE_PASSWORD`         | iOS     | Password set when exporting the .p12                     |
| `IOS_KEYCHAIN_PASSWORD`            | iOS     | Any strong random string — used for the CI-only keychain |
| `IOS_PROVISIONING_PROFILE_BASE64`  | iOS     | Base64-encoded App Store provisioning profile            |
| `APP_STORE_CONNECT_KEY_ID`         | iOS     | App Store Connect API key ID (e.g. `ABC1234DEF`)         |
| `APP_STORE_CONNECT_ISSUER_ID`      | iOS     | API issuer UUID from App Store Connect                   |
| `APP_STORE_CONNECT_PRIVATE_KEY`    | iOS     | Raw contents of the `.p8` API key file                   |

---

## 3. Android setup

### 3.1 Export your release keystore

You already have a local keystore at `~/my-release-key.jks`. You just need to
base64-encode it and store it as a secret.

```bash
# macOS — copies to clipboard
base64 -i ~/my-release-key.jks | pbcopy

# Linux
base64 -w 0 ~/my-release-key.jks
```

Paste the output as the `ANDROID_KEYSTORE_BASE64` secret.

The other three Android secrets come directly from your existing `key.properties`:

| Secret                      | Value (from your current key.properties) |
| --------------------------- | ---------------------------------------- |
| `ANDROID_KEYSTORE_PASSWORD` | `storePassword` value                    |
| `ANDROID_KEY_ALIAS`         | `keyAlias` value                         |
| `ANDROID_KEY_PASSWORD`      | `keyPassword` value                      |

> **Security note** — the `android/key.properties` file in your repo contains
> plaintext credentials. Consider adding it to `.gitignore` and generating it
> only in CI (the workflow already does this).

### 3.2 Create a Google Play service account

The workflow uses the official Google Play Developer API to upload the AAB.
You need a GCP service account with the right permissions.

**Step 1 — Create the service account in Google Cloud Console**

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and open
   (or create) the project linked to your Play Console account.
2. Navigate to **IAM & Admin → Service Accounts → Create Service Account**.
3. Give it a name like `github-play-publisher`.
4. Grant the role **Service Account User** (the Play Console grants store-level
   permissions separately in the next step).
5. Click **Done**, then open the service account, go to the **Keys** tab, and
   click **Add Key → Create new key → JSON**. Download the JSON file.

**Step 2 — Grant access in Play Console**

1. Open [play.google.com/console](https://play.google.com/console).
2. Go to **Setup → API access** and link your Google Cloud project if it is not
   already linked.
3. Find the service account you just created under **Service accounts** and click
   **Grant access**.
4. Assign the **Release manager** permission (or a custom permission that includes
   **Manage production releases** and **Manage testing track releases**).
5. Click **Apply** and **Invite user**.

**Step 3 — Store the JSON**

Paste the entire contents of the downloaded JSON file as the
`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` secret. Do not base64-encode it — the workflow
reads it as plain text.

---

## 4. iOS setup

### 4.1 Export your Distribution certificate

You need an **Apple Distribution** certificate (not Development). If you do not
have one, create it in Xcode or on the Apple Developer portal first.

**Export from Keychain Access**

1. Open **Keychain Access** on your Mac.
2. Under **My Certificates**, find the certificate named
   **Apple Distribution: Your Name (TEAMID)**.
3. Right-click → **Export**.
4. Choose the **Personal Information Exchange (.p12)** format.
5. Set a strong password — you will store this as `IOS_CERTIFICATE_PASSWORD`.
6. Save the file, then base64-encode it:

```bash
# macOS — copies to clipboard
base64 -i ~/certificate.p12 | pbcopy
```

Paste the output as `IOS_CERTIFICATE_BASE64`.

### 4.2 Download your provisioning profile

You need an **App Store** distribution provisioning profile (not Ad Hoc or
Development).

1. Go to [developer.apple.com/account](https://developer.apple.com/account) →
   **Certificates, Identifiers & Profiles → Profiles**.
2. Find your App Store profile for bundle ID `com.ihsueh.itrade`, or create one
   if it does not exist (choose **App Store Connect** as the distribution type).
3. Download the `.mobileprovision` file.
4. Base64-encode it:

```bash
# macOS — copies to clipboard
base64 -i ~/Downloads/iTrade_AppStore.mobileprovision | pbcopy
```

Paste the output as `IOS_PROVISIONING_PROFILE_BASE64`.

**Keychain password**

`IOS_KEYCHAIN_PASSWORD` is just used internally by the macOS runner to protect a
temporary keychain created during the build. It is never sent anywhere. Generate
any strong random string:

```bash
openssl rand -hex 20
```

### 4.3 Create an App Store Connect API key

This replaces Apple ID + password authentication and does not require two-factor
approval in CI.

1. Open [appstoreconnect.apple.com](https://appstoreconnect.apple.com) →
   **Users and Access → Integrations → App Store Connect API**.
2. Click **+** to generate a new key.
   - Give it a name like `GitHub CI Publisher`.
   - Set the role to **App Manager** (or **Developer** if you only need
     TestFlight uploads without release management).
3. Click **Generate**, then immediately download the `.p8` file — it can only
   be downloaded once.
4. Note the **Key ID** (e.g. `ABC1234DEF`) and the **Issuer ID** (UUID shown at
   the top of the page).

Store these three values as secrets:

| Secret                          | Where to find it                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `APP_STORE_CONNECT_KEY_ID`      | The 10-character key ID shown in the table                                                                |
| `APP_STORE_CONNECT_ISSUER_ID`   | The UUID at the top of the API Keys page                                                                  |
| `APP_STORE_CONNECT_PRIVATE_KEY` | Paste the full contents of the `.p8` file (including the `-----BEGIN PRIVATE KEY-----` header and footer) |

> **Do not base64-encode the `.p8` contents.** The workflow writes the raw text
> directly to a file.

---

## 5. Add secrets to GitHub

1. Go to your repository on GitHub.
2. Navigate to **Settings → Secrets and variables → Actions**.
3. Click **New repository secret** for each entry in the table in section 2.

If the repository belongs to an organisation and you want to share secrets across
multiple repos, you can add them as **organisation secrets** and grant access to
this repository instead.

---

## 6. Running the workflow

**Automatic trigger**

Bump the `version:` line in `apps/mobile/pubspec.yaml` and push to `main`:

```yaml
# apps/mobile/pubspec.yaml
version: 1.2.0+44 # changed from 1.1.0+43
```

The `detect-version` job will compare against the previous commit. If the version
string changed, both build jobs start in parallel.

**Manual trigger (with or without a version bump)**

Go to **Actions → 📱 Mobile Release → Run workflow**. Set `Force build` to `true`
to build even if the version did not change — useful for re-running after a
secrets change or a transient failure.

---

## 7. After the build

**Android**

The AAB is uploaded to the **internal testing track** in Google Play as a **draft**.
To promote it:

1. Open Play Console → your app → **Testing → Internal testing**.
2. Review the release and click **Promote release** to move it to Alpha, Beta, or
   Production.

To change the default track or status, edit the `track` and `status` fields in the
workflow's **Publish to Google Play** step.

**iOS**

The IPA is uploaded to **TestFlight**. Processing takes a few minutes after upload.
To release to the App Store:

1. Open App Store Connect → your app → **TestFlight** and confirm the build
   processed without issues.
2. Go to the **App Store** tab, create a new version, select the build, and submit
   for review.

**Workflow artifacts**

Both the AAB and IPA are also saved as GitHub Actions workflow artifacts for 14 days.
Go to **Actions → the completed run → Artifacts** to download them.

---

## 8. Troubleshooting

**`detect-version` always says version unchanged**

This happens when the workflow is triggered on the first commit to a branch
(no `HEAD~1` exists) or when `fetch-depth: 2` did not retrieve the previous commit.
Use `workflow_dispatch` with `force_build: true` as a workaround, or increase
`fetch-depth` if your branch history requires it.

**Android build fails with `keystore not found`**

Verify that `ANDROID_KEYSTORE_BASE64` decodes to a valid JKS file:

```bash
echo "<your-secret-value>" | base64 --decode > /tmp/test.jks
keytool -list -keystore /tmp/test.jks -storepass <password>
```

**iOS build fails with `No signing certificate ... found`**

- Confirm the certificate exported from Keychain is **Apple Distribution**, not
  **Apple Development**.
- Check that the provisioning profile type is **App Store** (not Ad Hoc).
- Make sure the provisioning profile's bundle ID matches `com.ihsueh.itrade`.

**iOS upload fails with `No suitable application records were found`**

The app record must exist in App Store Connect before the first upload. Go to
App Store Connect → **My Apps → +** → **New App** and create the record with bundle
ID `com.ihsueh.itrade`. You only need to do this once.

**`xcrun altool` deprecation warning**

Xcode 15+ shows a deprecation warning for `xcrun altool --upload-app`. The command
still works. If it is removed in a future Xcode version, replace the upload step
with [Fastlane deliver](https://docs.fastlane.tools/actions/deliver/) or the
[upload-testflight-build](https://github.com/marketplace/actions/upload-testflight-build)
GitHub Action.

**Google Play upload fails with `403 Forbidden`**

- Confirm the service account JSON is pasted as-is (not base64-encoded) into the
  `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` secret.
- Re-check that the service account was granted **Release manager** access in Play
  Console (Setup → API access) — this step is easy to miss.
- There can be up to 24 hours before new service account permissions propagate.
