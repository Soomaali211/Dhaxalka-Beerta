# Qorshaha Hagaajinta Beerta & Dhaxalka (Xallinta E1–E18 & Qaab-dhismeedka Cusub)

Qorshahani wuxuu si dhammaystiran u xallinayaa dhammaan **18-ka cilladood (E1 ilaa E18)** ee lagu xusay warbixinta *Falanqaynta App: Beerta & Dhaxalka*, isagoo casriyeynaya muuqaalka khariidadda, xisaabiyaha Faraa'idka, is-waafajinta tirooyinka bedka/plots-ka, iyo habaynta daabacaadda PDF — **iyadoo 100% la dhowrayo xisaabta Sharciga Faraa'idka iyo cabbirrada sahan-dhuleedka (90×48m block, 15m waddo, 18×24m plot, iyo half-plots)**.

## Go'aannada La Xaqiijiyey & Xuduudda Shaqada

> [!IMPORTANT]
> Go'aannadan hoose waxay ku salaysan yihiin jawaabahaaga la xaqiijiyey ka hor inta aan wax koodh ah la taaban:

- **Baaxadda Wejigan Koowaad**: Waxaan hadda dhisaynaa oo keliya **Falanqaynta Appka (E1–E18)** oo u qaybsan 3 marxaladood oo isku xiran, halka qaab-dhismeedka cusub iyo badhanka `+` loo diyaarinayo si hadhow si fudud loogu xiro **Sahanka AI v2 (raadinta 10 sano + gacanta)**.
- **Ilaalinta Xisaabta & Xogta**: Xisaabta Faraa'idka (Shaafici), kala-qaybinta dhulka, kaydka kiisaska hore, iyo isku-xirka Google Drive waxba lagama beddelayo dhanka xisaabta; keliya muuqaalka, hagidda, iyo midaynta xogta la soo bandhigayo ayaa la hagaajinayaa.
- **Cusboonaysiinta Android APK**: Marka dhammaan isbeddellada E1–E18 iyo imtixaannada hubinta la dhammaystiro, waxaan isla markiiba dib u dhisaynaa faylka saxeexan ee Android APK si uu diyaar ugu noqdo soo-dejinta.

---

## 1. Dulmarka Guud & Ujeeddada Hagaajinta

- **Waxa La Hagaajinayo**: App-ka waxaa laga saarayaa ciriiriga shaashadda yar, daaqadaha bidix ka go'aya, badhammada is-dul-fuulaya, tirooyinka bedka iyo plots-ka ee is-khilaafsan, iyo ereyada Ingiriisiga/Soomaaliga isugu dhafan, iyadoo loo beddelayo nidaam leh **4 tab oo cad**, **Bottom-Sheets 100% ballac ah**, **hal il-xisaabeed oo midaysan (Single Source of Truth)**, iyo **QGIS-style PDF Layout Designer** leh muuqaal weyn.
- **Cidda Adeegsanaysa**: Qoysaska Soomaaliyeed, culimada xisaabisa dhaxalka, iyo xirfadlayaasha sahanka beeraha ee ku shaqeeya taleefanka gacanta (Android APK / Mobile Web) iyo kombiyuutarka (Desktop).
- **Faa'iidada Ugu Weyn**: Khariidaddu waxay helaysaa **65%+ cabbirka shaashadda**, dhammaan tirooyinka `m²`, `ha`, `Plot`, iyo `Half` waxay isku si uga muuqanayaan meel kasta, isticmaaluhuna ma geli karo natiijo madhan isagoon dhaxle gelin.

---

## 2. Khibradda Isticmaalaha (UX) & Naqshadda Muuqaalka

### Socodka Cusub ee 4-ta Qaybood (4-Tab Sitemap)

1. **① Khariidad (65%+ Shaashadda)**:
   - Raadinta deegaanka waxay noqonaysaa bar kooban oo dul-sabaynaysa khariidadda dusha sare, halka xogta kooban (`Blocks · Buuxa · Nus (Half) · Bedka`) ay ku jirto hal saf oo nadiif ah.
   - Dhanka midig ee khariidadda waxaa ku taxan qalab kooban oo leh calaamad iyo qoraal gaaban (`+` / `-`, `Goobtayda`, `Xulo`, `Lakabyo`, `Heerar`) — **E17**.
   - Marka la taabto `Xulo`, `Lakabyo`, `Heerar`, ama `Furaha Midabada`, kama soo baxayaan dhinac cidhiidhi ah oo bidix ka go'a; waxay ka soo kacayaan hoosta iyagoo ah **Bottom-Sheet 100% ballac ah** oo leh bir la jiido (drag handle) — **E1**.
   - Midabka salka khariidadda ka hor inta aan sawirka dayax-gacmeedku soo dhicin wuxuu noqonayaa midab ciid dabiici ah (`#a98a5c`) oo leh muujiye degdeg ah, halkii uu ka noqon lahaa madow xariijimo leh — **E3**.
   - Calaamadda Blocks-ka (`R01…R18`) waxay noqonaysaa mid kooban oo bartamaha ku taal, iyadoo marka fog (`zoom < 17`) la muujinayo Blocks keliya, marka la soo dhoweeyana (`zoom ≥ 18`) ay soo baxayaan lambarrada Plots-ka (`P001…`) si aanay isu qarin — **E5**.
   - Badhanka cagaaran ee **`+`** wuxuu ka soo muuqanayaa **oo keliya** shaashadda `Khariidad` marka aanay furnayn wax Bottom-Sheet, Drawer, ama Modal ah, waxaana qoraalladiisa laga dhigayaa kuwo aad u cad — **E2 & E18**.

2. **② Xisaabi (3-Marxaladood oo Cad)**:
   - Stepper-ka sare wuxuu yeelanayaa **3 xaaladood oo kala duwan** (`① Hantida` → `② Dhaxalka` → `③ Natiijada`): Marxaladda dhammaatay (`✓` cagaar buuxa `#22c55e`), marxaladda aad joogto (xariiq cagaaran oo ifaysa), iyo marxaladda dhimman (madow deggen `#111b2e`) — **E6**.
   - Saddexdii badhan ee isku shaqada ahaa (`Next →`, `Arag Natiijada`, iyo tab-ka kore) waxaa lagu beddelayaa **hal bar oo hoosta ku dheggan** (`← Dib` iyo `Xiga →`) — **E14**.
   - Haddii tirada dhaxlayaashu tahay `0`, badhanka `Xiga →` wuu xirmayaa waxaana soo baxaya farriin digniin ah oo huruud/amber ah: *"Geli ugu yaraan hal dhaxle si aad u sii socoto"* — **E13**.

3. **③ Xogta (Kiisas · Blocks · Plots · Dhaxlayaal · Jadwal)**:
   - Cinwaannada muhiimka ah ee kiisaska (`KIIS-2026-0001 — …`) waxay qaadan karaan ilaa 2 sadar (`line-clamp-2`) si aanay u go'in — **E7**.
   - Liisaska kor u jiidma (scrollable tabs/filters) waxay yeelanayaan hadh yar oo muujinaya in dhanka midig wax ku hadhsan yihiin — **E9**.
   - Haddii kiisku leeyahay `0 dhaxle` ama aan weli khariidad lagu xirin, waxaa soo baxaya **EmptyState** nadiif ah oo leh badhanka `+ Bilow Xisaabi` — **E12**.

4. **④ Soo saar (QGIS-Style Layout Designer & Dhoofinta)**:
   - `Soo saar` waxay noqonaysaa qaybta 4-aad ee tooska ah ee hagidda hoose (Mobile) iyo dhinaca (Desktop), si looga maarmo badhammada isku nooca ah.
   - Qaabeeyaha PDF-ka (`Khariidadda Dhaxalka`, `Automatic_Layout11`, `Warbixinta Heerarka`) wuxuu yeelanayaa **muuqaal horudhac (Preview) aad u weyn** oo leh weynayn/yarayn (`+` / `-` / pinch-zoom) iyo badhanka **Shaashad Buuxda**, halka qalabka wax-ka-beddelku ku urursan yahay 4 qaybood oo kooban: **`Bog` · `Cabir` · `Legend` · `Cinwaan`** — **E7 & E8**.

5. **Liiska Dhinaca (`≡` Fadhi & Kiiska Firfircoon)**:
   - Drawer-ka bidix wuxuu noqonayaa meel nadiif ah oo lagu maamulo Kiiska Firfircoon, Kaydka Google Drive, Daliillada Qur'aanka, Lacagta, Xaaladda Khadka, iyo xogta guud ee App-ka.

### Nidaamka Midabbada, Farta & Taabashada (Design Tokens — E15 & E16)

- **Midabbada Rasmiga ah**:
  - Salka Guud: `#060d18` (`--bg-0`) iyo `#0a1220` (`--bg-1`)
  - Kaararka & Sheets-ka: `#111b2e` (`--surface`) oo leh xariiq `#223250` (`--border`)
  - Midabka Ficilka Koowaad: `#22c55e` (`--primary`) iyo `#16a34a` (`--primary-dark`)
  - Midabbada Macnaha Leh: Xog `#38bdf8`, Xulasho/Digniin `#facc15`, Khalad `#f87171`
  - Qoraalka: Qoraalka koowaad `#e8eef7` iyo qoraalka labaad `#a9b8d0` (oo leh is-barbardhig iftiin `≥ 4.5:1` WCAG AA si uu qorraxda dibadda ugu muuqdo — **E16**).
- **Farta & Cabbirka Taabashada**:
  - `Plus Jakarta Sans` cinwaannada iyo qoraalka caadiga ah (`14px–16px`, ugu yaraan `12px` xogta yar), `JetBrains Mono` (`tabular-nums`) dhammaan tirooyinka bedka, saamiyada, iyo lacagta, iyo `Amiri` aayadaha Qur'aanka.
  - Dhammaan badhammada la taabto waxay yeelanayaan cabbir ugu yaraan **`48×48px`** (mobile ergonomics).
  - Dhammaan ereyada Ingiriisiga ee ku dhex jiray muuqaalka (`Selection`, `Clear Selection`, `Map Selection Tools`, `Cases`, `Heirs`, `Next`) waxaa loo beddelayaa **Af-Soomaali saafi ah oo midaysan** (`Qalabka Xulashada`, `Nadiifi Xulashada`, `Kiisas`, `Dhaxlayaal`, `Xiga →`) — **E15**.

---

## 3. Go'aannada Farsamo & Sababaynta

- **Go'aanka 1: Midaynta Xisaabta Bedka & Tirada Plots-ka (E10 & E11)**
  - *Qaabka La Doortay*: Dhammaan shaashadaha App-ku (`Khariidad`, `Drawer`, `Xisaabi`, `Xogta`, `Soo saar`, iyo `PDF`) waxay ka akhrisanayaan hal xisaabiye dhexe (*Unified Metrics Selector*) oo soo saaraya tirooyin magacyo cad leh:
    1. **Bedka Xuduudka Beerta**: Cabbirka guud ee wareegga beerta (`m²` iyo `ha`, tusaale `95,700 m² · 9.57 ha`).
    2. **Bedka Plots-ka La Qaybinayo**: Wadarta bedka plots-ka dhabta ah ee dhaxalka ku jira (`50,976 m²` marka Half laga reebo, ama `53,352 m²` marka Half lagu daro).
    3. **Tirada Plots-ka**: `118 Buuxa · 11 Nus (Half)` oo si cad u muujinaysa haddii Half-ku `Ku jiro` ama `Laga reebay`, iyo tirada `Muuqda` marka filter la isticmaalo.
  - *Sababta*: Tani waxay gabi ahaanba meesha ka saaraysaa jahawareerkii saddexda lambar ee kala duwanaa (`53,352 m²`, `50,976 m²`, `9.57 ha`) iyadoon waxba laga beddelin xisaabta hoose.

- **Go'aanka 2: Beddelidda Daaqadaha Dhinaca oo laga dhigo Bottom-Sheets (E1, E2, E4)**
  - *Qaabka La Doortay*: Mobile-ka iyo Tablet-ka dushooda, qalabka khariidaddu wuxuu ka soo baxayaa hoosta (`Bottom-Sheet` 100% ballac ah oo leh saddex heer dherer iyo xiritaan fudud), isla markaana si toos ah ayuu u qarinayaa badhanka `+`.
  - *Sababta*: Taleefannada gacanta ee dhuuban (`360px–412px`), daaqadaha dhinaca ka furma waxay gooyaan qoraalka bidix waxayna qariyaan khariidadda; Bottom-Sheet-ku wuxuu ilaaliyaa aragtida khariidadda wuxuuna u fudud yahay suulka gacanta.

---

## 4. Qaab-dhismeedka Nidaamka & Socodka Xogta

### Jaantuska Qaab-dhismeedka Midaysan

```
┌───────────────────────────────────────────────────────────────────────────┐
│                   KAYDKA & XAALADDA KIISKA FIRFIRCOON                     │
│  Kiisaska Kaydsan · Dhaxlayaasha & Hantida · Nashqadda GIS · Undo/Redo    │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │
                                     ▼
┌───────────────────────────────────────────────────────────────────────────┐
│              MATOORRADA XISAABTA (100% SIDoodII LOO ILAALIYEY)            │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌───────────────────┐  │
│  │ Xisaabiyaha         │  │ Matoorka Qaybinta   │  │ Xisaabiyaha Cusub │  │
│  │ Faraa'idka (Sharia) │  │ Beerta (90×48/15m)  │  │ ee Metrics Midaysan│ │
│  └─────────────────────┘  └─────────────────────┘  └───────────────────┘  │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │ (Hal Il-Xogeed oo Midaysan + Af-Soomaali)
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
┌─────────────────┐       ┌─────────────────────┐       ┌───────────────────┐
│  ① KHARIIDAD    │       │     ② XISAABI       │       │  ③ XOGTA & ④ SOO  │
│ 65%+ Muuqaal    │       │ Stepper 3-Xaaladood │       │      SAAR         │
│ + Bottom-Sheets │       │ + Hubinta ≥1 Dhaxle │       │ Kiisas/Plots +    │
│ + Zoom Labels   │       │ + Sticky Dib/Xiga   │       │ QGIS PDF Designer │
└─────────────────┘       └─────────────────────┘       └───────────────────┘
```

### Isku-xirka Ficillada & Xaaladaha Shaashadda

- **Maamulka Lakabyada Dusha Sare (Overlay & FAB Governance)**:
  - Waxaa jiraya hal xaalad dhexe oo kontoroolaysa daaqadaha furan (`activeSheet`: `none | selection | layers | tiers | legends | plot_detail | fab_menu | drawer | export_modal`).
  - Marka `activeSheet !== 'none'` ama isticmaaluhu joogo tab aan ahayn `Khariidad`, badhanka cagaaran ee `+` si otomaatig ah ayuu u qarsoomayaa (**E2**), sidoo kalena hal sheet oo keliya ayaa mar furmi kara si aanay isu dul-saaran.
- **Hubinta Tallaabooyinka Xisaabta (Wizard Validation)**:
  - Xisaabiyuhu wuxuu si toos ah u xisaabinayaa tirada dhaxlayaasha la geliyey; haddii wadartu tahay `0`, badhanka `Xiga →` wuxuu noqonayaa `disabled`, fariin tilmaan ah ayaa muuqanaysa, mana u gudbi karo shaashadda natiijada ilaa ugu yaraan 1 dhaxle la doorto (**E12, E13, E14**).
- **Calaamadaha Khariidadda ee La Jaanqaada Fogaan-Aragga (Adaptive Zoom Labels)**:
  - Dhagaystaha `zoomend` ee Leaflet wuxuu xakamaynayaa muuqaalka sumadaha: `zoom < 15` xuduudka iyo waddooyinka oo keliya; `15 ≤ zoom < 17.5` calaamadaha Blocks-ka (`R01`) oo aan is-dul-fuulayn; `zoom ≥ 17.5` lambarrada Plots-ka (`P001`) iyo cabbirkooda (**E5**).
- **Habaynta & Daabacaadda PDF-ka (QGIS-Style Print Composer)**:
  - Marka isticmaaluhu wax ka beddelo `Bog` (`A4/A3`, `Jiif/Taag`), `Cabir` (`Scale bar` & `Waqooyi`), `Legend` (`Dhaxlayaasha` / `Heerarka` / `Nus-Plots`), ama `Cinwaan` (2-sadar oo aan go'ayn), warqadda SVG-ga ee Preview-ga weyn isla daqiiqaddii ayay is-cusboonaysiinaysaa iyadoo isticmaalaysa isla xisaabiyaha Metrics-ka midaysan (**E7, E8, E10, E11**).
- **Xaqiijinta & Dhismaha Android APK**:
  - Marka koodhka la dhammeeyo, waxaa la wada socodsiinayaa dhammaan imtixaannada hubinta (`127+ unit tests` + imtixaannada cusub ee Metrics-ka midaysan iyo hubinta dhaxlayaasha), dhismaha Web-ka, iyo dhismaha faylka saxeexan ee **`Beerta-iyo-Dhaxalka.apk`**.
