# Store listings and test builds

Everything the App Store and Google Play ask for lives here, so a listing change is a pull request.

| Folder | What |
|---|---|
| `apple/en-US/` | App Store Connect: name, subtitle, keywords, promotional text, description, URLs, review notes, TestFlight "What to test" |
| `play/en-US/` | Google Play: title, short and full description |
| `captions/` | Screenshot captions, one file per language |
| `screenshots/` | JPEGs made by `tools/store-screenshots.mjs` from the real app (frozen data and clock) |

`tools/check-store.mjs` runs in the apps workflow and fails if any text is over a store limit.
Privacy answers for both stores: the project's legal folder, `05-app-store-privacy-answers.md`. The iOS privacy manifest
written by `tools/native-assets.mjs` matches it (one data type: the optional note in "Report a problem", not linked, not tracking).

## Screenshot sizes

| Folder | Pixels | Store slot |
|---|---|---|
| `apple-iphone-6.9` | 1320 x 2868 | iPhone 6.9" (required; Apple scales it down for smaller iPhones) |
| `apple-ipad-13` | 2064 x 2752 | iPad 13" (required: the app runs on iPad) |
| `play-phone` | 1242 x 2484 | Phone |
| `play-tablet-7` | 1080 x 1920 | 7-inch tablet |
| `play-tablet-10` | 1440 x 2560 | 10-inch tablet |

Make them again after a design change: `bash qa/build-site.sh _site && node qa/serve.mjs _site 4173 &` then
`node tools/store-screenshots.mjs store/screenshots en`. The script stops if a caption doesn't fit.

## App Store listing (`.github/workflows/store-apple.yml`)

Actions → **App Store listing** → Run workflow sends the text in `apple/en-US/` and the iPhone 6.9" and iPad 13" screenshots to App Store Connect with fastlane deliver. It replaces the screenshots already there, never uploads a build and never submits for review. It uses the same `PM_ASC_KEY_ID` / `PM_ASC_KEY_P8` secrets as the iOS build.

## Builds (`.github/workflows/apps.yml`)

Every push to main and every pull request that touches the native setup builds an Android test APK and an iOS Simulator build.
With signing secrets in place it also makes a signed Android App Bundle on every run.
**Sending to testers** happens only from Actions → "Plenty Map apps" → Run workflow → tick "Send to testers".

### GitHub secrets

| Secret | What it is |
|---|---|
| `PM_ANDROID_KEYSTORE_B64` | The upload key file, base64 (made 2026-11-21, valid to 2054) |
| `PM_ANDROID_KEYSTORE_PASSWORD` | Its password |
| `PM_ANDROID_KEY_ALIAS` | `upload` |
| `PM_ANDROID_KEY_PASSWORD` | Same as the keystore password |
| `PM_ASC_KEY_ID` | App Store Connect API key (Users and Access → Integrations → Team keys, access **Admin**, so Xcode can make the distribution certificate itself) |
| `PM_ASC_KEY_P8` | The downloaded `AuthKey_XXXX.p8`: open it in TextEdit and paste everything, including the BEGIN/END lines |
| (team and issuer ids) | Written into apps.yml: team `VNJA6Y7DCH`, issuer `323b291b-…` (ids, not credentials) |
| `PM_PLAY_SERVICE_ACCOUNT_JSON` | Optional. Google Cloud service account JSON with "Release to testing tracks" permission in Play Console |

Upload key fingerprint (Play Console shows this after the first upload, so you can check it's ours):
SHA-256 `6F:9D:3C:DB:1C:B5:31:71:5F:4F:F5:F7:53:D9:CB:63:C3:F5:2E:41:DD:5C:FC:8E:69:58:E4:EA:6B:F3:7B:63`.
Google keeps the real app signing key (Play App Signing), so a lost upload key can be reset in Play Console.

### First time on each store

**Apple**
1. Done 2026-11-21: bundle ID `com.plentymap.app` registered and the App Store Connect app created (Apple ID 6837537584, SKU `plentymap-ios`).
2. Add the `PM_ASC_KEY_ID` and `PM_ASC_KEY_P8` secrets, then run the workflow with "Send to testers". The build shows in TestFlight after Apple's processing (10 to 30 minutes).
3. TestFlight → Internal Testing → add testers (people on the App Store Connect team; up to 100). No Apple review needed for internal testers.
4. Export compliance is answered by the app itself (`ITSAppUsesNonExemptEncryption` = NO).

**Google Play**
1. Play Console → Create app: "Plenty Map: Eat Well for Less", English (US), App, Free. Accept the declarations.
2. Run the workflow (no tick needed) and download the `plenty-map-android` artifact: it holds `app-release.aab`.
3. Testing → Internal testing → Create new release → upload that `.aab` (Google offers Play App Signing: accept). Add testers by email list, roll out, share the opt-in link.
4. Optional: link a service account and add `PM_PLAY_SERVICE_ACCOUNT_JSON`; later builds then upload as drafts by themselves.
5. Production for a new personal account needs a closed test with at least 12 testers for 14 days first. Internal testing doesn't.
