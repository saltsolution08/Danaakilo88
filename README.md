# Dankali — iibinta data internet (app + website + admin)

Mashruucan waxaa ku jira **saddex qaybood** oo isku xiran, oo isku database ah:

| Qayb | Cinwaan | Waa maxay |
|---|---|---|
| App / website-ka macmiilka | `https://magaca-aad-doorato/` | Macmiilku wuu is-diiwaangeliyaa, wuu iibsadaa data, wuu shubtaa wallet-kiisa. Waa **PWA**: taleefanka waa lagu rakibi karaa sida app. |
| Admin | `https://magaca-aad-doorato/admin/` | Dalabyada, lacag-shubka, isticmaalayaasha, float-ka, qiimaha, xayeysiisyada, settings. |
| Server + database | (gudaha) | Node.js + SQLite. **Ma jiraan dependencies** (wax `npm install` ah looma baahna). |

## Sida ay u shaqeyso (Habka hadda — "manual")

1. Macmiilku wuxuu doortaa shirkad (Somtel/Telesom/Soltelco), qayb, baakad, wuxuuna riixaa **Iibso**.
2. Wuxuu doortaa habka lacag-bixinta (EVC Plus, Zaad, eDahab, Soltelco, ama **Wallet**), wuxuuna lacagta u diraa lambarkaaga merchant-ka, kadibna geliyaa **lambarka uu ka bixiyay + Transaction ID**.
3. Admin-ka ayaa arkaya dalabka (waxaa muuqda tiro cas iyo codka digniinta). Wuxuu hubiyaa lacagta merchant-kiisa → riixaa **Xaqiiji lacagta**.
4. Admin-ku wuxuu data-da ku diraa lambarka macmiilka (USSD/app-ka reseller-ka) → riixaa **Gaarsiiyay**. Float-ka shirkaddaas si toos ah ayuu u dhacaa.
5. **Dalabyada macmiilka:** macmiilku wuxuu arkaa dalabyadiisa oo bil bil loo kooxeeyay, dalab kastana wuxuu muujiyaa maalinta, bisha, sannadka iyo saacadda (iyo goorta la gaarsiiyay), iyo tirada iyo wadarta bil kasta. Admin ayaa qarin kara (Settings).
6. **Wallet:** macmiilku wuu shubtaa (codsi + Transaction ID), admin-ku wuu ogolaadaa, kadibna wuxuu iibsan karaa isla markiiba (Wallet-ka waa la jaraa, dalabka waa "la bixiyay"). Haddii internet la'aan jiro, codsiga shubka waa la kaydiyaa, wuxuuna is-gudbiyaa marka internet yimaado.
7. **Reseller:** admin-ku wuxuu isticmaale ka dhigi karaa Reseller (qiimo jaban, tusaale 5%). Qiimaha waxaa xisaabiya server-ku (ma khiyaamayn karo).

> **Muhiim:** USSD (sida `*105*...#`) website-ka iyo server-ka ma garaaci karaan. Sidaas darteed gaarsiinta data-da iyo iibsiga float-ka waa gacan ilaa aad API ka hesho shirkadaha. Marka aad API hesho, buuxi `providers.js` (adapter kasta) oo `PROVIDER_MODE=api` dhig.
> Hubinta lacagta waa gacan (admin-ku wuxuu isbarbar dhigayaa Transaction ID-ga iyo warbixinta merchant-ka). Si toos ah u xaqiijin, waxaad u baahan tahay merchant API (EVC Plus/WaafiPay, Zaad, eDahab).

## Automation (si toos ah, adigoo gacan ku darin)

Hadafku waa: **macmiilku lacagta u diro → API-gu akhriyo → dalabka/wallet-ka si toos ah loo xaqiijiyo → data si toos ah loo diro → float si toos ah loo iibsado.** Server-kaasi hadda wuu diyaar yahay; waxa ka maqan waa **API-yada shirkadaha** (adapter-yada). Waxay u shaqeeyaan sidan:

1. **Lacagta soo gashay.** Lacag-bixiyaha (EVC Plus/WaafiPay, Zaad, eDahab) wuxuu server-kaaga u diraa ogeysiis (**webhook**) `POST https://magacaaga/api/webhooks/evc` (`evc`, `zaad`, `edahab`, `soltelco`), ama server-ku wuu weydiiyaa liiska lacagaha (**polling**, `payments.js > pollers`). Lacag kasta waxay gashaa liiska (Admin > **Lacag-soo-gashay**).
2. **Is-xaqiijin.** Marka Transaction ID-ga macmiilku geliyay uu la mid yahay lacagta soo gashay (**isla habka**, **lambarka bixiyay**, iyo **qadarka ≥ qiimaha**), dalabka waa "la bixiyay" isla markiiba. Haddii lacagtu soo gasho **ka hor** inta uusan Transaction ID geliyin, waxaa la xiraa marka uu geliyo.
3. **Waxa aan toos ahayn (baaritaan).** Lacag yar, ama lambar bixiyay oo ka duwan → dalabku wuxuu galaa **"Baaritaan"** oo admin ayaa go'aamiya (ma gaarsiin karo si khalad ah).
4. **Gaarsiin toos ah.** Admin > Settings > "Data si toos ah u gaarsii" → server-ku wuxuu u yeedhaa adapter-ka shirkadda (`providers.js`). Haddii API-gu fashilmo wuxuu dib isku dayaa 3 jeer (30 ilbiriqsi, 2 daqiiqo, 10 daqiiqo), kadibna wuxuu kuu reebaa gacan (dalabku wuxuu ku hadhaa "La bixiyay" oo fiiro leh).
5. **Float toos ah.** "Float si toos ah u iibso" → marka float-ku ka hoos dhaco xadka, `restock` adapter-ka ayaa la yeedhaa (haddii shirkaddu taageerto).

**Waxa aad u baahan tahay si ay u shaqeyso:**
- Shirkad kasta (Somtel, Telesom, Soltelco): **reseller API** (gaarsiin data, hubinta float, iibsiga float haddii jiro).
- Lacag-bixiye kasta (EVC Plus, Zaad, eDahab): **merchant API** (webhook ama liis lacagaha soo galay).
- Marka aad hesho documentation-ka, buuxi adapter-ka (`providers.js`, `payments.js`) — qaab-dhismeedka oo dhan, xaqiijinta, dib-isku-dayga iyo tijaabooyinkii waa diyaar (`node test.js`).
- Environment variables: `PROVIDER_MODE=api`, `WEBHOOK_SECRET=...` (nambar sir ah oo dheer) iyo furayaasha API-yada.
- **Muhiim:** webhook-ku wuxuu u baahan yahay saxiix (HMAC) si cidna u been-abuuri weydo lacag. Adapter kasta waa inuu hubiyaa saxiixa lacag-bixiyaha.

> Intaan API la helin, ha shidin "Si toos ah u gaarsii". Habka gacanta ah (Xaqiiji → Gaarsiiyay) wuu shaqeynayaa.

## Akhrinta SMS (ma u baahna merchant API — waa habka ugu dhakhsaha ah ee bilowga)

Taleefanka SIM-ka merchant-ka leh waxaad ku rakibtaa **app SMS forwarder** (Android) oo fariin kasta oo soo gasha u dira server-kaaga. Server-ku wuxuu akhriyaa fariinta lacag-helka (qadarka, Transaction ID, lambarka bixiyay), wuxuuna si toos ah u xaqiijiyaa dalabka ama wallet-ka.

1. Render → Environment: `SMS_TOKEN` = nambar sir ah oo dheer.
2. Taleefanka merchant-ka: SMS forwarder app → URL: `POST https://magacaaga/api/webhooks/sms/zaad` (`evc`, `zaad`, `edahab`, `soltelco`), header: `Authorization: Bearer <SMS_TOKEN>`, jirka JSON: `{"message":"<qoraalka fariinta>","sender":"<ka kasta>"}` (magacyada beddelka (placeholders) waxay ku kala duwan yihiin app kasta).
3. Admin → **Settings → Akhrinta SMS**: ku dheji fariin dhab ah, qor regex-ka qadarka / Transaction ID / lambarka bixiyay, riix **Tijaabi** ilaa uu saxo. Ku dar **sender**-ka la oggol yahay (magaca ay ka timaado fariinta lacag-helka).
4. Haddii fariintu ma laha Transaction ID, server-ku wuxuu isku xirayaa **lambarka bixiyay + qadarka** (60 daqiiqo gudaheeda).

**Digniin amni:** SMS-ka waa la been-abuuri karaa. Ilaalinta: (a) sender allowlist, (b) **xadka SMS** (dalab ka weyn → Baaritaan, Settings), (c) hubi warbixinta merchant-ka maalin kasta. Taleefanku waa inuu ahaadaa mid shidan, internet leh, battery-na ku filan.

## Beddelka lacagta merchant-ka u noqoto float ($30)

- Lacag kasta oo soo gasha (SMS/webhook/xaqiijin gacan) waxaa lagu daraa **lacagta merchant-ka** ee wallet-kaas ($).
- Marka **hal wallet** (tusaale Zaad) gaaro xadka (Settings: tusaale **$30**) iyo "beddel toos ah" la shiday, server-ku wuxuu u beddelayaa float shirkadda **float-keeda ugu hooseeyo**, isagoo yeedhaya `restock` adapter-ka (`providers.js`).
- Beddelku wuxuu u baahan yahay **kanaal iibsi**: API-ga shirkadda, ama taleefan Android oo USSD u dira. Intaas la helin, Float tab wuxuu muujiyaa lacagta diyaarka ah; adiga ayaa iibsada, kadibna Diiwaan geli adigoo dooranaya "Laga bixiyay" (merchant-ku way dhimanaysaa).
- Lacagta wallet-yo kala duwan (Zaad + EVC) lama isku darayo: wallet kasta si gooni ah ayaa loo xisaabiyaa.

## Waxa aad u baahan tahay (liis)

1. **GitHub** (waad leedahay) iyo **Render** (waad leedahay).
2. **Lambarrada merchant** ee aad lacagta ku qaadanayso: EVC Plus, Zaad, eDahab, Soltelco.
3. **Akoon reseller** oo shirkad kasta ah (Somtel, Telesom, Soltelco) iyo float aad ka iibsato (tusaale $100 → $117).
4. **Lambar WhatsApp** oo caawimaad ah, iyo link-yada TikTok / Instagram / Facebook.
5. **Magac domain** (ikhtiyaari, tusaale `dankali.com`) si dadku u xasuustaan.
6. Marka dambe, si ay wax u noqdaan toos ah: **API documentation** ka shirkadaha iyo **merchant API** ka lacag-bixiyayaasha (la xiriir shirkad kasta oo weydii "reseller / merchant API").
7. Hubi shuruucda iyo ruqsadaha ganacsiga ee degaankaaga (iibinta airtime/data iyo qaadashada lacagta).

## Qiimaha (ku dhawaad)

| Shay | Qiimo | Fiiro |
|---|---|---|
| Render Web Service **Starter** | **$7 / bil** | Free ma ku filna: wuu "seexdaa" oo disk joogto ah ma lahan |
| Render Persistent Disk (1 GB) | **$0.25 / bil** | Database-ka ayaa halkan ku jira, xogtu ma luntu |
| **Wadarta hosting-ka** | **≈ $7.25 / bil** (≈ $87 / sannad) | |
| Domain (.com) | ≈ $10–15 / sannad | Qiimaha waxaa go'aamiya registrar-ka |
| Google Play (ikhtiyaari) | $25 hal mar | App-ka PWA waxaa loo baakadayn karaa Play Store |
| Apple App Store (ikhtiyaari) | $99 / sannad | |
| Float (raasumaal) | adiga ayaa go'aamiya | tusaale $100 ka bilaw |
| Lacag-bixin API / API shirkadaha | **ku xiran heshiis** | La xiriir shirkad kasta |

Qiimayaasha Render hubi **dashboard-ka Render**, waa isbeddeli karaan.

## Sida loo geliyo (Deploy) — tallaabo tallaabo

1. **Fur ZIP-ka** (Extract All). Gudaha waxaad arkaysaa: `server.js`, `db.js`, `Dockerfile`, `public/`...
2. GitHub → **New repository** → magac `dankali` → dooro **Private** → Create.
3. **Add file → Upload files**. Gudaha folder-ka la furay riix **Ctrl + A**, kadibna **jiid dhammaan** (oo ay ku jirto folder-ka `public`) sanduuqa GitHub.
   - Hubi liiska: waa inuu muujiyaa `server.js`, `public/app.js`, `public/admin/admin.js`... **ma aha** `/dankali/...` hortiisa.
   - Haddii faylasha qarsoon (`.gitignore`, `.dockerignore`, `.env.example`) aanad arkin: Explorer → View → Show → Hidden items.
   - **Ha upload-gareynin faylka `.env`** (haddii aad leedahay).
4. **Commit changes**.
5. Render → **New + → Web Service** → dooro repo `dankali` → **Language: Docker** → Region: ka dooro mid u dhow macaamiishaada.
6. **Instance Type: Starter ($7)**.
7. **Advanced → Add Disk**: Name `dankali-data`, **Mount Path `/var/data`**, Size `1 GB`.
8. **Environment Variables** (halkan oo keliya, ha gelin GitHub):

   | KEY | VALUE |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATA_DIR` | `/var/data` |
   | `ADMIN_EMAIL` | email-kaaga |
   | `ADMIN_PASSWORD` | password **cusub** oo adag (12+ xaraf) |
   | `WHATSAPP` | `252634...` (+ la'aan) |
   | `PAYMENTS` | `EVC Plus:252634...,Zaad:252634...,eDahab (Somtel):252634...` |

   (`PAYMENTS` iyo `WHATSAPP` waa kuwa bilowga; marka dambe waxaad ka beddeli kartaa **Admin → Settings**.)
9. **Create Web Service**. Sug 2–4 daqiiqo ilaa uu noqdo **Live**.
10. Fur `https://dankali.onrender.com/admin/`, gal adigoo isticmaalaya `ADMIN_EMAIL` iyo `ADMIN_PASSWORD`.
11. **Admin → Settings:** hubi lambarrada lacag-bixinta, WhatsApp, social media. **Admin → Qiimaha:** hubi qiimayaasha.
12. **Admin → Float:** diiwaan geli float-ka aad hore u iibsatay (tusaale Somtel $100).

### Taleefanka u rakib sida app
- **Android (Chrome):** fur website-ka → ⋮ → **Install app / Add to Home screen**.
- **iPhone (Safari):** Share → **Add to Home Screen**.

### Magac domain (ikhtiyaari)
Render → service-ka → **Settings → Custom Domains** → ku dar domain-kaaga, oo raac tilmaamaha DNS ee Render.

## Amni (ha ka tagin)

- **Beddel** password-ka admin-ka ee hore loo arkay. Isticmaal mid cusub oo aan weligii hore loo isticmaalin.
- **Ha gelin** password, lambar iyo email dhab ah GitHub (kaliya Render → Environment).
- Repo-ga ka dhig **Private**.
- **Backup:** Admin → Settings → **Soo deji backup** — samee toddobaad kasta ugu yaraan, oo ku kaydi meel kale.
- Password-yada waa la sir-gareeyaa (scrypt), session-ku waa HttpOnly cookie, login-ku wuxuu leeyahay xaddid isku-day.

## Faylasha

```
server.js        server-ka iyo API-ga oo dhan
db.js            database (SQLite), jadwalada, xogta bilowga
providers.js     halkan ku xir API-ga shirkadaha (marka aad hesho)
public/          app-ka macmiilka (PWA): index.html, app.js, style.css, sw.js, manifest, logos
public/admin/    admin dashboard
test.js          tijaabo toos ah (node test.js)
Dockerfile       Render-ka
render.yaml      (ikhtiyaari) Render Blueprint
```

Tijaabo gudaha PC-gaaga (Node 22.13+): `node test.js` (41 tijaabo), ama `ADMIN_EMAIL=... ADMIN_PASSWORD=... node server.js` kadibna fur `http://localhost:3000`.
