# Privacy labels — Biocatalyst India

These answers reflect version 1.0.2. The client communicates with the
operator's HTTPS API and includes no advertising, analytics, attribution, or
crash-reporting SDK. Data is not sold and is not used for tracking.

## Data the app handles

- Email address and password are submitted only when a person chooses to
  create or use an account. The server stores the email and a password hash;
  the app stores only its session credential in the OS secure store.
- When a person chooses **Continue with Google**, Google supplies a signed ID
  token containing the account's stable ID, verified email address, and basic
  profile name. The backend verifies that token and stores the Google account
  link; the app never receives or stores the person's Google password.
- Signed-in users can save companies/drugs to a watchlist and receive in-app
  alerts. These account-linked selections and app interactions are stored on
  the operator's server to provide the requested functionality.
- An optional support/data-issue report can include contact text supplied by
  the user.
- Normal server security and rate-limiting logs can contain an IP address and
  are retained according to the published privacy policy.

The app does not collect a push token in version 1.0.2. It does not collect
precise location, contacts, photos, videos, audio, health, financial-account,
messages, advertising ID, or device sensor data.

## Google Play Data safety

Answer **Yes** to collection and **No** to sharing.

| Play data type | Collected | Purpose | Required? |
|---|---|---|---|
| Email address (Personal info) | Required account sign-in | Account management, app access and functionality | Required; users may use any valid email address, including Gmail |
| User IDs (Personal info) | Internal account identifier and, when selected, Google account identifier | Account management | Optional; created or linked with an account |
| App interactions (App activity) | Watchlist choices and in-app alert state | App functionality and personalization | Optional; signed-in feature |
| Other user-generated content | Text deliberately submitted in a support/data issue report | Developer communications and app functionality | Optional |

Security answers:

- Data is encrypted in transit: **Yes** (`https://biocatalyst-india.vercel.app`).
- Users can request deletion: **Yes**. The Account screen provides in-app
  deletion, and the public support/privacy pages provide a contact route.
- Data is shared with third parties: **No** for the app's product purposes.
- Data is used for advertising or tracking: **No**.

## Apple App Privacy

For a future iOS submission, disclose Email Address, User ID, Product
Interaction, and Other User Content as linked to the user and used for App
Functionality. Mark all as not used for tracking. Reconfirm Apple's current
category wording in App Store Connect when that submission is prepared.

## Live policy and deletion links

- Privacy policy: `https://biocatalyst-india.vercel.app/privacy`
- Support: `https://biocatalyst-india.vercel.app/support`
- Account deletion: available inside the signed-in Account screen

Re-run this audit if push, analytics, ads, payments, social features, or any
new native SDK is introduced.
