// おそうじサバイバー: ドイツ語の文言。text は script.js の TEXT と同じキー、ほかは EN_* と同じ形。help は遊び方の HTML
(window.CS_I18N = window.CS_I18N || {}).de = {
  text: {
    pageTitle: "Cleaning Survivors",
    pageDesc: "Ein Actionspiel im Stil von Vampire Survivors: Beseitige Wellen von Müll und Dreck mit Putzausrüstung, die von selbst angreift. 10 Level in Normal und Schwer. Putze alle Räume in 10 Minuten.",
    gameTitle: "Cleaning Survivors",
    backToGames: "‹ Spiele",
    pause: "Pause",
    compress: "Pressen",
    board: "Spielfeld",
    language: "Sprache",
    warn: (name) => `Achtung! ${name} kommt näher!`,
    rush: "Müll-Ansturm!",
    tooTough: "Zu hart! Putz drumherum",
    shieldDmg: (n) => `SCH ${n} %`,
    shieldNone: "Keine Barriere",
    bossDown: (name) => `${name} beseitigt!`,
    srcLeft: (room, n) => `Quelle zerstört! (${room}: noch ${n})`,
    srcAll: (room) => `Alle Quellen in „${room}“ zerstört!`,
    dumped: (c) => `Müll entsorgt! +${c} Münzen`,
    roomDone: (room, bonus) => `${room} blitzblank! ${bonus}`,
    roomTreasure: (room) => `${room} blitzblank! Ein Schatz ist aufgetaucht!`,
    timeUp: "Zeit abgelaufen …",
    allClean: "Alle Räume geputzt!",
    dumpLabel: "MÜLL",
    hudDone: (room) => `${room} fertig!`,
    hudRooms: (d, n) => `Räume ${d}/${n} fertig`,
    hudSrc: (s, d, n) => `Quellen ${s} · Räume ${d}/${n} fertig`,
    hudKills: (k) => `Beseitigt ${k}`,
    hudHp: (a, b) => `LP ${a}/${b}`,
    hudBoxFull: "VOLL!",
    hudBox: (a, b) => `Staubbox ${a}/${b}`,
    completion: "Fortschritt",
    completionMeta: (c, ct, tr, tt) => `Siege ${c}/${ct} · Schätze ${tr}/${tt}`,
    logoSmall: "SCHRUBBEN · FEGEN · ÜBERLEBEN",
    logo: "CLEANING<br>SURVIVORS",
    tagline: "Beseitige Wellen von Müll und Dreck mit deiner Putzausrüstung!",
    play: "Spielen",
    cleaners: "Putzkräfte",
    tutorial: "Tutorial",
    tutAskTitle: "Neu im Spiel?",
    tutAskText: "Willst du zuerst im <b>Tutorial</b> die Grundlagen lernen? Du putzt ein kleines Haus mit drei Räumen in <b>2–3 Minuten</b>, mit Tipps unterwegs.",
    tutAskPlay: "Tutorial spielen",
    tutAskSkip: "Überspringen",
    tutAskNote: "Wenn du überspringst, erscheint dieser Hinweis nicht mehr. Das Tutorial kannst du jederzeit über den Titelbildschirm oder die Levelauswahl spielen.",
    tutorialMeta: "Ein kleines Haus mit drei Räumen, um in 2–3 Minuten die Grundlagen zu lernen",
    recommended: "Für Neulinge",
    toStage1: "Zu Level 1",
    noteTutorial: "Tutorial geschafft! Als Nächstes: Level 1, „Das Müllhaus: Erdgeschoss“",
    noteTutorialRetry: "Versuch das Tutorial noch einmal",
    tutMove: "Lauf zuerst ein Stück. Bewege dich mit <b>WASD / Pfeiltasten</b> (auf dem Handy über den Bildschirm wischen). Deine Putzausrüstung arbeitet <b>automatisch</b>",
    tutKill: "Geh näher an den Müll heran. Deine Ausrüstung beschädigt Müll in der Nähe <b>automatisch</b>. Achte auf die <b>LP-Leiste</b> unter deiner Figur",
    tutDust: "Beseitigter Müll lässt <b>Staub</b> (Rauten) fallen. Sammle ihn für Erfahrung und <b>steig im Level auf</b>",
    tutLevelUp: (a, b) => `Level-up! Wähle eine Ausrüstung oder ein Passiv. Du kannst nur ${a} Ausrüstungen und ${b} Passive tragen, also überleg dir deine Kombination`,
    tutSource: "Der rot gepunktete Ring ist eine <b>Quelle</b>, aus der Müll kommt. Die Leiste darüber ist ihre <b>Schmutzbarriere</b>, die schwächer wird, je sauberer der Boden drumherum ist. Schrubb drumherum und zerstör sie dann",
    tutRoom: "<b>Zerstöre alle Quellen</b> eines Raums und putze <b>mindestens 90 %</b> seines Bodens, um ihn abzuschließen. Die % oben rechts zeigen, wie sauber der Raum ist",
    tutChest: "Raum fertig! Du bekommst eine <b>Truhe</b> und einen Raumbonus. Heb die Truhe auf, um sie zu öffnen",
    tutDump: "Aufgesammelter Staub landet im <b>Mülleimer</b> (Staubbox) unten links. <b>Ist er voll, halbiert sich dein Schaden, du kannst keinen Staub mehr sammeln und wirst langsamer</b>. Stell dich auf den <b>grünen Müllplatz</b>, den es in jedem Raum gibt, um ihn zu leeren",
    tutDanger: "Räume mit mehr ★ sind dreckiger und ihr Müll ist zäher, also <b>fang mit wenigen ★ an</b>. In echten Leveln gewinnst du, wenn du <b>alle Räume in 10 Minuten</b> putzt. Putz die restlichen Räume!",
    achievements: "Erfolge",
    achClears: "Siege nach Putzkraft (Extra)",
    settings: "Einstellungen",
    stageSelect: "Level wählen",
    recordOf: (name) => `Rekorde von ${name}`,
    coins: "Münzen",
    hardNote: "Schwer: LP und Schaden von Müll und Quellen etwa 3- bis 7-mal so hoch wie in Normal (je nach Level), Anzahl ×1,2. Münzen ×1,6. Bring deine Dauer-Upgrades zuerst auf etwa die Hälfte. Das letzte Level ist selbst mit 80 % ein Münzwurf.",
    lockedPrev: "Schließe das vorige Level in Normal ab, um hineinzukommen",
    lockedHard: "Schließe dieses Level in Normal ab, um Schwer freizuschalten",
    bestRooms: (r, n) => `Beste: ${r}/${n} Räume geputzt`,
    bestClear: (time) => `Bestzeit ${time}`,
    roomCount: (n) => `${n} Räume`,
    badgeTreasure: "S",
    treasure: "Schatz",
    skills: "Upgrades",
    zukan: "Müll-Lexikon",
    toTitle: "Titel",
    unlockText: (n, stage) => `Kommt dazu, wenn du den Schatz von Level ${n}, „${stage}“, findest`,
    trait: (name, desc) => `Talent „${name}“: ${desc}`,
    charStats: (hp, gears) => `LP ${hp} · Startausrüstung: ${gears}`,
    sep: ", ",
    stageTitle: (n, name) => `Level ${n}: ${name}`,
    planAlt: "Grundriss",
    briefDesc: "<b>Putze alle Räume in 10 Minuten</b>, um das Level zu schaffen. Zerstöre alle <b>Quellen</b> (rote Punkte) eines Raums und bring seinen Boden zum Glänzen, um ihn abzuschließen und eine Truhe und einen Bonus zu bekommen. <b>Räume mit mehr ★ sind dreckiger</b>, mit mehr und zäherem Müll. Gehst du zu früh hinein, wirst du überrannt, also fang mit den Räumen mit wenigen ★ an. Quellen sind <b>umso härter, je dreckiger ihre Umgebung ist</b>, also schrubb zuerst drumherum.",
    srcCount: (n) => `Quellen ${n}`,
    treasureFoundLine: (name) => `Schatz „${name}“ gefunden!`,
    treasureHint: (st, room) => `Schatz: Putze den ${st}-Raum „${room}“ fertig, um ihn zu finden`,
    joined: (name) => `${name} ist dabei`,
    willJoin: "Mit diesem Schatz schaltest du eine neue Putzkraft frei",
    bossNote: (mid, boss) => `Der Zwischenboss „${mid}“ erscheint bei 5:00, der Boss „${boss}“ bei 9:00.`,
    cleared: "Geschafft",
    pickCleaner: "Wähle deine Putzkraft",
    deploy: (mode) => `Los (${mode})`,
    back: "Zurück",
    charsSub: "Extra-Rekorde für Komplettierer; sie zählen nicht zum Fortschritt. Wähle eine Putzkraft, um ihre Siege pro Level und Modus zu sehen",
    treasures: (a, b) => `Schätze (${a}/${b})`,
    roomsCell: (r, n) => `${r}/${n} Räume`,
    clears: (a, b) => `Siege ${a}/${b}`,
    stage: "Level",
    useCleaner: "Diese Putzkraft nehmen",
    planStart: "START",
    paused: "Pause",
    pauseSub: (stage, left, d, n) => `${stage} · noch ${left} · Räume geputzt ${d}/${n}`,
    resume: "Weiter",
    retry: "Neu starten",
    toStages: "Levelauswahl",
    onigiri: "Reisbällchen",
    onigiriDesc: "Stellt 50 LP wieder her",
    savings: "Notgroschen",
    savingsDesc: "Münzen +10",
    evoWith: (p) => `Entwickelt sich mit ${p}`,
    evoChest: "Öffne eine Truhe zur Entwicklung!",
    evoNeed: (p) => `Kann sich mit ${p} entwickeln`,
    evoFor: (w) => `Nötig für die Entwicklung von ${w}`,
    pickOne: "Wähle eine Ausrüstung oder ein Passiv",
    tagGear: "Ausrüst.",
    canUpgrade: (n) => `${n} Upgrades möglich`,
    shopCta: (c, n) => `Du hast ${c} Münzen! ${n} Dauer-Upgrades sind möglich, und sie gelten für alle weiteren Runden`,
    recipeAria: (g, p, e) => `${g} + ${p} entwickelt sich zu ${e}`,
    boxFullBanner: "Mülleimer VOLL! Ab zum Müllplatz",
    boxFullNag: "VOLL! Kein Staub sammelbar",
    boxNear: "Fast voll",
    dangerWord1: "Dreck 1 · Leicht",
    dangerWord2: "Dreck 2 · Normal",
    dangerWord3: "Dreck 3 · Zäh",
    dangerWord4: "Dreck 4 · Gefahr!",
    dangerWord5: "Dreck 5 · Extrem!!",
    tagPassive: "Passiv",
    inventory: "Dein Inventar",
    emptySlot: "Leer",
    slots: (g, gm, p, pm) => `Ausrüstung ${g}/${gm} · Passive ${p}/${pm}`,
    slotNote: (g, p) => `Du kannst nur ${g} Ausrüstungen und ${p} Passive tragen, deine Kombination bestimmt also, wie du kämpfst.`,
    reroll: (n) => `Neu würfeln (noch ${n})`,
    treasureNew: "Schatz gefunden!",
    owned: " (schon im Besitz)",
    joinedBang: (name) => `${name} ist jetzt im Team!`,
    evolved: "ENTWICKELT!!",
    evolvedText: (w, e, d) => `${w} hat sich zu „${e}“ entwickelt! ${d}`,
    chest: "Truhe",
    coins30: "Münzen +30",
    noteAllRooms: "Alle Räume geputzt!",
    noteTreasure: (name) => `Schatz „${name}“ gefunden!`,
    noteStage: (n, name) => `Level ${n}, „${name}“, ist jetzt offen!`,
    noteHard: "Schwer ist für dieses Level jetzt offen!",
    noteAll: "Die ganze Villa blitzt und blinkt! Glückwunsch!",
    noteFirst: (c, m) => `Erster Sieg in ${m} mit ${c}!`,
    wornOut: "Erschöpft …",
    resultSub: (stage, mode, c) => `${stage} · ${mode} · ${c}`,
    clearTime: "Zeit",
    playTime: "Spielzeit",
    roomsCleaned: "Geputzte Räume",
    houseClean: "Sauberkeit (ganzes Haus)",
    kills: "Beseitigter Müll",
    level: "Level",
    coinKills: "Münzen (Müll)",
    coinClean: "Münzen (Sauberkeit)",
    coinDump: "Münzen (Müllplätze & Truhen)",
    coinRoom: "Münzen (Räume & Quellen)",
    coinBoss: "Münzen (Bosse)",
    coinClear: "Münzen (Sieg)",
    coinMul: (hard) => `Multiplikator (${hard ? "Schwer, " : ""}Upgrades)`,
    total: "Gesamt",
    nextStage: "Nächstes Level",
    again: "Nochmal",
    shopSub: "Gilt für alle Putzkräfte, ab der nächsten Runde",
    max: "MAX",
    cost: (c) => `${c} Münzen`,
    killed: (n) => `Beseitigt ${n}`,
    se: "Soundeffekte",
    bgm: "Musik",
    shake: "Wackeln & Blitze",
    haze: "Dreckdunst",
    reviveTitle: "Noch ein Versuch?",
    reviveText: "Steh mit vollen LP genau dort wieder auf, wo du gefallen bist. Wiederbeleben geht nur einmal pro Runde.",
    reviveBtn: "Wiederbeleben",
    giveUp: "Aufgeben",
    revived: "Wieder da! Weiter geht's!",
    rerollPlus: "+2 Neuwürfe",
    coinsX: (n) => `Münzen ×1,5 (+${n})`,
    coinAd: "Münzen (×1,5-Bonus)",
    withAd: (s) => `📺 Werbung ansehen: ${s}`,
    adLoading: "Werbung wird geladen …",
    adFailed: "Werbung konnte nicht geladen werden. Warte kurz und versuch es noch einmal",
  },
  enemies: {
    dust: ["Wollmaus", "Schwach, kommt aber in riesigen Schwärmen. In jedem Raum zu finden."],
    hair: ["Haarknäuel", "Mischt sich unter den Staub. Verheddert es sich an dir, wirst du etwas langsamer."],
    paper: ["Papierknäuel", "Der gewöhnlichste Müll. Verfolgt dich auf direktem Weg."],
    can: ["Leere Dose", "Rollt heran und rammt dich. Das tut weh."],
    bottle: ["Plastikflasche", "Schneller und härter als eine Dose. Prallt von Wänden ab."],
    grease: ["Klebriges Fett", "Ein glibbriger Schleim. Verschmutzt den Boden und bremst dich bei Berührung stark."],
    spore: ["Schimmelspore", "Hält Abstand und verstreut Sporen. Wer sie einatmet, bekommt eine Allergie, die LP kostet."],
    bag: ["Müllsack", "Platzt beim Beseitigen und verteilt den Müll darin."],
    pile: ["Müllhaufen", "Eine Quelle, die ständig Müll erzeugt und den Boden verschmutzt, bis du sie zerstörst."],
    drain: ["Überlaufender Abfluss", "Eine Quelle, die klebriges Fett und Haare ausspuckt."],
    nest: ["Schimmelnest", "Eine Quelle von Schimmelsporen. Desinfektionsspray wirkt gut dagegen."],
    boxes: ["Kartonstapel", "Eine Quelle, aus der Papierknäuel und Dosen rollen."],
    yokai: ["Müllghul", "Der Zwischenboss bei 5:00. Verstreut Müll, während er näher kommt."],
    kaiju: ["Schimmelmonster", "Der Boss bei 9:00. Überzieht den Boden mit Schimmel und schießt Sporen."],
    master: ["Herr des Müllhauses", "Der Boss des Herrensaals. Er kontrolliert das ganze Müllhaus."],
  },
  weapons: {
    vacuum: ["Turbosauger", "Richtet eine kegelförmige Düse auf nahen Müll und beschädigt alles darin.",
      ["Schaden +2", "Saugreichweite +15", "Saugwinkel +15°", "Schaden +3", "Saugintervall −0,06 s", "Saugreichweite +20", "Schaden +4, Winkel +15°"]],
    washer: ["Hochdruckreiniger", "Schießt einen Wasserstrahl auf nahen Müll, der ihn durchdringt und wegstößt.",
      ["Strahlen +1", "Schaden +5", "Strahlbreite +5", "Strahlen +1", "Schaden +6", "Reichweite +80, Intervall −0,2 s", "Strahlen +1, Schaden +6"]],
    robot: ["Putzroboter", "Kreist um dich, zermalmt Müll und poliert den Boden.",
      ["Roboter +1", "Schaden +3", "Kreisradius +16", "Roboter +1", "Schnellere Drehung, Schaden +3", "Robotergröße +4", "Roboter +1"]],
    spray: ["Desinfektionsspray", "Hinterlässt um dich einen anhaltenden Desinfektionsnebel. Doppelter Schaden gegen Schimmel.",
      ["Nebel +1", "Nebelgröße +8", "Schaden +2", "Dauer +0,6 s", "Nebel +1", "Nebelgröße +10", "Schaden +3, Nebel +1"]],
    roller: ["Fusselrolle", "Folgt dir und rollt Müll und Dreck auf deinem Weg auf.",
      ["Schaden +3", "Breite +8", "Schaden +3", "Rollen +1", "Breite +8", "Schaden +4", "Rollen +1"]],
    mop: ["Wischmopp", "Fegt einen weiten Bogen vor dir, stößt Müll weg und schrubbt den Boden kräftig.",
      ["Schaden +4", "Reichweite +12", "Intervall −0,12 s", "Schaden +5", "Wischwinkel +40°", "Reichweite +16", "Schaden +6, Intervall −0,1 s"]],
    duster: ["Staubwedel", "Fliegt wie ein Bumerang und fegt Müll auf dem Hin- und Rückweg weg. Durchdringt.",
      ["Schaden +3", "Wedel +1", "Distanz +40", "Größe +4, Schaden +3", "Wedel +1", "Intervall −0,25 s", "Schaden +5, Wedel +1"]],
    bomb: ["Reinigerbombe", "Wirft Reiniger in Müllgruppen; der platzende Schaum putzt sie alle weg.",
      ["Schaden +6", "Explosionsgröße +10", "Bomben +1", "Intervall −0,3 s", "Schaden +8", "Explosionsgröße +12", "Bomben +1, Schaden +6"]],
    purifier: ["Luftreiniger", "Hält die Luft um dich sauber, beschädigt nahen Müll langsam und drängt ihn zurück.",
      ["Radius +8", "Schaden +2", "Intervall −0,08 s", "Radius +10", "Schaden +3", "Radius +10, Intervall −0,06 s", "Schaden +4"]],
    press: ["Staubpresse", "Presst den Inhalt der Staubbox nach und nach zusammen und löst eine Schockwelle aus. Je mehr Staub, desto stärker, und die Box wird auch leerer.",
      ["Schockwellengröße +20", "Schaden +4", "Intervall −0,6 s", "Pressmenge +5 %", "Schockwellengröße +25", "Schaden +6", "Intervall −0,7 s, Pressmenge +5 %"]],
    sponge: ["Schmutzradierer", "Prallt von Wänden ab, fliegt durch den Raum und schrubbt Müll und Dreck weg.",
      ["Schaden +3", "Schwämme +1", "Flugzeit +1 s", "Größe +4", "Schaden +4, schneller", "Schwämme +1", "Schaden +5, Flugzeit +1 s"]],
  },
  evos: {
    blackhole: ["Schwarzes-Loch-Sauger", "Setzt vor dir einen Saugwirbel, der allen Müll darin beschädigt."],
    steam: ["Heißdampfkanone", "Ein dicker, langer Dampfstrahl, der alles auf seiner Linie sofort blank poliert."],
    army: ["Putzroboter-Trupp", "Die Roboter suchen selbst nach Dreck und Müll und patrouillieren durch den Raum."],
    acid: ["Säureregen-Nebel", "Lässt Desinfektionsmittel über den ganzen Bildschirm regnen."],
    giant: ["Riesenwalze", "Eine riesige Walze, die deinen ganzen Weg poliert und Müll zerquetscht."],
    tornado: ["Tornado-Mopp", "Fegt ununterbrochen mit hoher Geschwindigkeit rund um dich."],
    gale: ["Windgott-Wedel", "Mehrere große Wedel fliegen los und holen den Staub auf ihrem Weg zurück."],
    foam: ["Schaumexplosion", "Riesige Explosionen hinterlassen Schaum, der Müll eine Weile lang auflöst."],
    aura: ["Reinigungsbarriere", "Eine riesige Barriere, die Müll verbrennt und alles darin verlangsamt."],
    megapress: ["Megapresse", "Eine bildschirmfüllende Schockwelle, die auch den Boden auf einen Schlag reinigt."],
    meteor: ["Schwamm-Meteorschauer", "Viele große Schwämme springen lange umher und polieren den ganzen Raum."],
  },
  passives: {
    battery: ["Zusatzakku", "Angriffsintervall der Ausrüstung −8 %"],
    boiler: ["Warmwasserboiler", "Schaden der Ausrüstung +10 %"],
    roomba: ["Extra-Putzroboter", "Anzahl der Ausrüstung +1 (Strahlen, Roboter, Nebel, Wedel, Bomben, Schwämme)"],
    bleach: ["Starke Bleiche", "Angriffsbereich +10 %"],
    tape: ["Superklebeband", "Wirkungsdauer +10 %"],
    dustpack: ["Großer Staubbeutel", "Staubbox-Kapazität +40, Sammelreichweite +20 %"],
    boots: ["Gummistiefel", "Halbiert die Verlangsamung auf dreckigem Boden, LP +20"],
    gloves: ["Gummihandschuhe", "Erlittener Schaden −1"],
    hydraulic: ["Hydraulikzylinder", "Rückstoß +25 %, Staubbox-Kapazität +15"],
    filter: ["HEPA-Filter", "Regeneriert 0,25 LP pro Sekunde"],
    wax: ["Bodenwachs", "Laufgeschwindigkeit +6 %, Geschossgeschwindigkeit +10 %"],
  },
  chars: {
    cleaner: ["Hajime der Putzmann", "Polierprofi", "Polierradius beim Laufen +40 %", "Ein legendärer Putzmann. Ein gewissenhafter Veteran, dem kein Fleck entgeht."],
    mizuki: ["Mizuki die Wäscherin", "Druckfanatikerin", "Schaden +15 %", "Eine ungeduldige Wäscherin, die ihren Hochdruckreiniger liebt."],
    runta: ["Runta der Robo", "Geländereifen", "Auf dreckigem Boden nicht langsamer", "Ein Putzroboter, gebaut nach den Plänen aus der Abstellkammer."],
    koroko: ["Koroko mit der Rolle", "Sammeltalent", "Sammelreichweite +40 %, Staubbox +40", "Ein ordnungsliebendes Mädchen, das die legendäre Fusselrolle geerbt hat."],
    kiyoshi: ["Dr. Kiyoshi", "Starkes Immunsystem", "Immun gegen Allergien, +50 % Schaden gegen Schimmel", "Ein Doktor, der sein Leben der Schimmelforschung widmet. Er suchte sein verlorenes Notizbuch."],
    tome: ["Oma Tome", "Weisheit des Alters", "Startet mit 2 Ausrüstungen, EP +25 %", "Die frühere Verwalterin der Villa. Langsam auf den Beinen, aber an Weisheit und Erfahrung kommt niemand an sie heran."],
  },
  bonus: {
    speed: "Laufgeschwindigkeit +10 %",
    magnet: "Sammelreichweite +25 %",
    hp: "Max. LP +20",
    regen: "Regeneriert 0,5 LP/s",
    might: "Schaden +10 %",
    cd: "Angriffsintervall −6 %",
    box: "Staubbox-Kapazität +40",
    armor: "Erlittener Schaden −1",
    area: "Angriffsbereich +10 %",
    heal: "Stellt alle LP wieder her",
  },
  shop: {
    hp: ["Gesundheit", "Max. LP +12"],
    might: ["Kraft", "Schaden +8 %"],
    clean: ["Putzkraft", "Polierradius beim Laufen +12 %, Polierbereich der Ausrüstung +6 %"],
    speed: ["Tempo", "Laufgeschwindigkeit +4 %"],
    armor: ["Abwehr", "Erlittener Schaden −1"],
    regen: ["Regeneration", "Regeneriert 0,2 LP/s"],
    magnet: ["Sammelreichweite", "Sammelreichweite +10 %"],
    xp: ["Erfahrung", "Erhaltene EP +8 %"],
    box: ["Staubbox", "Kapazität +20"],
    coin: ["Münzen", "Erhaltene Münzen +10 %"],
    choices: ["Auswahl", "Auswahl beim Level-up 3 → 4"],
  },
  modes: { normal: "Normal", hard: "Schwer" },
  stages: [
    ["Das Müllhaus: Erdgeschoss", "Rund ums Wohnzimmer. Vor allem Staub, Papier und Dosen.",
      { genkan: "Eingang", rouka: "Flur", living: "Wohnzimmer", washitsu: "Tatami-Zimmer", dining: "Esszimmer" },
      ["Familienalbum", "Ein altes Album der Familie der Villa, gefunden unter dem Müll."]],
    ["Die verfluchte Küche", "Viel Fett und Abfall. Abflüsse spucken Fett, und der Boden wird schnell wieder dreckig.",
      { rouka: "Flur", dining: "Esszimmer", kitchen: "Küche", pantry: "Speisekammer", laundry: "Waschküche", katte: "Hintertür" },
      ["Goldener Wasserhahn", "Ein glänzender Wasserhahn aus reinem Gold. Eine gewisse Wasserexpertin wünscht ihn sich schon lange."]],
    ["Die verschimmelten Badezimmer", "Voller Schimmelsporen. Der Badezimmerboden ist rutschig.",
      { rouka: "Flur", bath: "Badezimmer", datsui: "Umkleide", toilet: "Toilette", senmen: "Waschraum" },
      ["Perlenseife", "Eine geheimnisvolle Seife, deren Schaum wie Perlen glänzt."]],
    ["Die verschlossene Kammer & 1. Stock", "Abstellkammer und Wandschrank sind voller Kartons, und die Wege sind eng.",
      { kids: "Kinderzimmer", study: "Arbeitszimmer", hall: "Treppenhalle", storage: "Abstellkammer", nando: "Wandschrank" },
      ["Roboterbaupläne", "Baupläne eines Putzroboters, tief in der Abstellkammer versteckt."]],
    ["Der verwilderte Garten", "Ein Garten, durch Hecken unterteilt. Der Teich ist voller Schimmel.",
      { gate: "Tor", path: "Weg", front: "Vorgarten", flower: "Blumenbeet", yard: "Wäscheplatz", shed: "Schuppen", pond: "Teichufer" },
      ["Vierblättriges Kleeblatt", "Ein Glücksklee, der einzige, der am Teich wächst."]],
    ["Der staubige Dachboden", "Ein Dachboden voller wirbelndem Staub und Haaren. Überall Kartons.",
      { stairs: "Dachbodentreppe", passage: "Gang", oldclothes: "Altkleiderzimmer", chests: "Truhenlager", skylight: "Oberlichtzimmer", nook: "Nische", secret: "Geheimzimmer" },
      ["Legendäre Fusselrolle", "Eine legendäre Fusselrolle, die angeblich jeden Müll aufnimmt."]],
    ["Der Heizungskeller", "Ein Keller voller Fett und Schimmel. Der Heizungsraum ist voller Abflüsse.",
      { under: "Unter der Treppe", corridor: "Kellergang", cellar: "Weinkeller", washroom: "Waschecke", boiler: "Heizungsraum", store: "Vorratsraum" },
      ["Alte Taschenuhr", "Eine Taschenuhr, gefunden hinter dem Heizkessel. Sie tickt noch."]],
    ["Die Gerümpelgarage", "Eine Garage voller Dosen und Flaschen. Der hintere Schuppen ist ein Kartonberg.",
      { side: "Seitentür", bench: "Werkbank", garage: "Garage", tools: "Werkzeugecke", tires: "Reifenstapel", back: "Hinterer Schuppen" },
      ["Notizbuch von Dr. Desinfektion", "Notizen eines Doktors, der jahrelang gegen Schimmel kämpfte. Sein Besitzer sucht es."]],
    ["Der verwunschene Bankettsaal", "Der große Saal nach dem Fest. Berge von Abfall und Fett.",
      { lobby: "Foyer", cloak: "Garderobe", pantry: "Anrichteraum", hall: "Bankettsaal", stage: "Bühne", green: "Künstlergarderobe" },
      ["Silberner Kerzenleuchter", "Ein Kerzenleuchter, der auf der Bühne zurückblieb. Der Liebling der Geister."]],
    ["Der Herrensaal", "Das letzte Level, in dem jeder Müll auftaucht. Der Boss ist der Herr des Müllhauses.",
      { shoko: "Bibliothek", bedroom: "Schlafzimmer", closet: "Ankleide", hall: "Großer Saal", master: "Herrenzimmer" },
      ["Schlüssel der Villa", "Ein alter Schlüssel, der jede Tür der Villa öffnet. Er gehörte der früheren Verwalterin."]],
  ],
  tutorial: ["Tutorial", "Ein kleines Haus mit drei Räumen, um das Spiel zu lernen.", { genkan: "Eingang", living: "Wohnzimmer", washitsu: "Tatami-Zimmer" }],
  help: `
    <h2>So wird gespielt</h2>
    <p>Räume mit deiner Putzausrüstung ein vermülltes Haus aus und <b>bring alle Räume in 10 Minuten zum Glänzen</b>. Du steuerst nur die Bewegung, die Putzausrüstung arbeitet von selbst. Beseitigter Müll lässt Staub fallen, den du als Erfahrung einsammelst. Beim Level-up wählst du eine neue Ausrüstung oder ein Passiv und wirst stärker. Du verlierst, wenn die Zeit abläuft oder deine LP auf null fallen.</p>

    <h3>Tutorial</h3>
    <p>Neulinge fangen am besten mit „Tutorial“ auf dem Titelbildschirm an (es wird dir auch beim ersten Druck auf „Spielen“ angeboten). Du putzt in 2–3 Minuten ein kleines Haus mit drei Räumen, während Tipps unten im Bild und ein grüner Pfeil dich durch Bewegung, Level-up, Quellen, das Abschließen von Räumen, Truhen und Müllplätze führen. Das Tutorial zählt nicht zum Fortschritt.</p>

    <h3>Grundrisse und Quellen</h3>
    <p>Es gibt 10 Level. Jedes Level ist ein Haus mit 5–7 Räumen, getrennt durch Wände und Türen. In den Räumen gibt es rot gepunktet umrandete „Quellen“ (Müllhaufen, Abflüsse, Schimmelnester, Kartonstapel), aus denen der meiste Müll kommt. Quellen verschmutzen den Boden um sich herum, bis du sie zerstörst. Außerdem sind sie von einer „Schmutzbarriere“ (einem braunen Film) umgeben, die sie umso härter macht, je dreckiger der Boden drumherum ist. Über jeder Quelle siehst du die Stärke der Barriere (eine 5-stufige Leiste) und wie viel deines Schadens gerade durchkommt (z. B. „SCH 12 %“). Je röter die Leiste, desto härter die Quelle. Putzt du drumherum, sinkt die Leiste und deine Angriffe wirken, also schrubb zuerst drumherum. Je mehr Quellen du zerstörst, desto weniger Müll entsteht. Die Minikarte oben links zeigt, wie dreckig jeder Raum ist und wo die Quellen (rot) sind.</p>

    <h3>Dreckstufe der Räume (★)</h3>
    <p>Jeder Raum hat eine Dreckstufe von ★1 bis ★5. Je mehr ★, desto dreckiger der Raum, mit mehr und härteren Quellen und viel mehr und viel stärkerem Müll (Fett und Schimmel ab ★3, Müllsäcke ab ★4). Müll in einem Raum streift darin umher, bis du hineingehst oder in die Nähe kommst. Betrittst du einen ★5-Raum auf niedrigem Level, bist du schnell erledigt, also fang mit Räumen mit wenigen ★ an und werde stärker. Müll in Räumen mit vielen ★ lässt öfter großen Staub fallen.</p>

    <h3>Einen Raum abschließen</h3>
    <p>Zerstöre alle Quellen eines Raums und putze mindestens 90 % seines Bodens, um ihn abzuschließen (der Rest wird automatisch poliert). Du bekommst eine Truhe und einen raumspezifischen Bonus (schnellere Bewegung, mehr max. LP usw.), und der Raum wird nie wieder dreckig.</p>

    <h3>Normal und Schwer</h3>
    <p>Jedes Level hat einen Normal- und einen Schwer-Modus. Schaffst du ein Level in Normal, werden das nächste Level und der Schwer-Modus dieses Levels freigeschaltet. In Schwer gibt es mehr und viel zäheren Müll, und es ist kaum zu schaffen, bevor deine Dauer-Upgrades etwa zur Hälfte ausgebaut sind (das letzte Level in Schwer ist selbst bei 80 % ein Münzwurf). Gib deine Münzen für „Dauer-Upgrades“ aus, bevor du es versuchst (Schwer bringt 1,6-mal so viele Münzen).</p>

    <h3>Dauer-Upgrades</h3>
    <p>Gib verdiente Münzen aus, um Gesundheit, Kraft, Putzkraft (wie breit du den Boden polierst), Tempo, Abwehr, Regeneration, Sammelreichweite, Erfahrung, Staubbox-Größe, Münzen und die Anzahl der Level-up-Auswahlen zu erhöhen. Sie gelten ab der nächsten Runde für alle Putzkräfte. Öffne sie über die Schaltfläche „⬆ Upgrades“ auf dem Titelbildschirm oder in der Levelauswahl. Kannst du dir ein Upgrade leisten, leuchtet die Schaltfläche golden und zeigt die Anzahl.</p>

    <h3>Belohnungs-Schaltflächen (Wiederbeleben, Neuwürfe, Münzen ×1,5)</h3>
    <p>Bist du erschöpft, kannst du einmal pro Runde an Ort und Stelle wieder aufstehen (volle LP, und Müll in der Nähe wird weggefegt). Gefallen dir die Level-up-Auswahlen nicht, kannst du 2 Neuwürfe dazubekommen. Schaffst du ein Level, kannst du die verdienten Münzen mit 1,5 multiplizieren. Auf CrazyGames läuft vor jeder dieser Belohnungen eine Werbung.</p>

    <h3>Putzkräfte und Schätze</h3>
    <p>Es gibt 6 Putzkräfte, jede mit eigener Startausrüstung und eigenem Talent (poliert beim Laufen breiter, wird auf dreckigem Boden nicht langsamer, bekommt keine Allergien usw.). Jedes Level versteckt einen Schatz, der erscheint, wenn du den Raum mit den meisten ★ abschließt. Schätze werden beim Aufheben sofort gespeichert, und bestimmte Schätze bringen eine neue Putzkraft ins Team. Im Bildschirm „Erfolge“ (über den Titel) siehst du die Siege jeder Putzkraft pro Level und Modus und die gesammelten Schätze.</p>

    <h3>Fortschritt</h3>
    <p>Der Fortschritt zählt, wie viele von 30 Zielen du erreicht hast: Siege in jedem Level in jedem Modus (10 Level × 2 Modi = 20) plus die Schätze (10). Jede Putzkraft kann einen Sieg holen. Die Siege der einzelnen Putzkräfte werden im Bildschirm „Erfolge“ als Extra-Rekorde gezeigt, zählen aber nicht zum Fortschritt.</p>

    <h3>Dreckige Böden</h3>
    <p>Der Boden ist dreckig, und je dreckiger er ist, desto langsamer läufst du. Wo deine Putzausrüstung entlangkommt, wird der Boden sauber. Auf blitzblankem Boden läufst du schneller und sammelst Staub aus größerer Entfernung. Der Dreck breitet sich langsam aus, und Müll hinterlässt Dreck, wo er läuft. Solange alles verdreckt ist, liegt ein brauner Dunst über dem Bild; er lichtet sich, je mehr du deine Umgebung und das ganze Haus putzt (in den Einstellungen abschaltbar).</p>

    <h3>Staubbox und Müllplätze</h3>
    <p>Der gesammelte Staub kommt in den Mülleimer (Staubbox) unten links. <b>Ist er voll, halbiert sich der Schaden deiner Ausrüstung, du kannst keinen Staub mehr sammeln (keine Erfahrung) und wirst langsamer.</b> Bei 80 % wird der Eimer orange, voll blinkt er rot, und ein Pfeil zeigt zum nächsten Müllplatz. Stell dich auf den <b>grünen Müllplatz, den es in jedem Raum gibt</b>, um ihn zu leeren (du bekommst Münzen). Deine LP zeigt die Leiste unter deiner Figur.</p>

    <h3>Builds (Plätze für Ausrüstung und Passive)</h3>
    <p>Es gibt 11 Arten von Putzausrüstung, aber pro Runde kannst du <b>nur 4 Ausrüstungen und 4 Passive</b> tragen. Der Wischmopp fegt um dich herum, der Staubwedel fliegt hin und zurück, die Reinigerbombe wird in Müllgruppen geworfen, der Schmutzradierer prallt von Wänden ab, der Luftreiniger hält nahen Müll auf Abstand, die Staubpresse presst die Staubbox zu einer Schockwelle und so weiter – deine Kombination verändert, wie du kämpfst. Am besten wählst du eine Ausrüstung zusammen mit dem Passiv, das sie entwickelt. Die Level-up- und Truhenbildschirme zeigen dein Inventar (Ausrüstung blau, Passive lila markiert) und die Entwicklungsrezepte (Ausrüstung + Passiv → entwickeltes Symbol). Betrittst du einen Raum, erscheint seine Dreckstufe (★) oben im Bild.</p>

    <h3>Entwicklung</h3>
    <p>Bring eine Putzausrüstung auf Level 8 und öffne eine Truhe, während du das passende Passiv hast, um sie zu entwickeln. Truhen lassen golden umrandeter Müll, Zwischenbosse und Bosse fallen.</p>
    <table>
      <tbody>
        <tr><th>Turbosauger + Zusatzakku</th><td>Schwarzes-Loch-Sauger</td></tr>
        <tr><th>Hochdruckreiniger + Warmwasserboiler</th><td>Heißdampfkanone</td></tr>
        <tr><th>Putzroboter + Extra-Putzroboter</th><td>Putzroboter-Trupp</td></tr>
        <tr><th>Desinfektionsspray + Starke Bleiche</th><td>Säureregen-Nebel</td></tr>
        <tr><th>Fusselrolle + Superklebeband</th><td>Riesenwalze</td></tr>
        <tr><th>Wischmopp + Gummihandschuhe</th><td>Tornado-Mopp</td></tr>
        <tr><th>Staubwedel + Gummistiefel</th><td>Windgott-Wedel</td></tr>
        <tr><th>Reinigerbombe + Großer Staubbeutel</th><td>Schaumexplosion</td></tr>
        <tr><th>Schmutzradierer + Bodenwachs</th><td>Schwamm-Meteorschauer</td></tr>
        <tr><th>Luftreiniger + HEPA-Filter</th><td>Reinigungsbarriere</td></tr>
        <tr><th>Staubpresse + Hydraulikzylinder</th><td>Megapresse</td></tr>
      </tbody>
    </table>

    <h3>Steuerung am Smartphone</h3>
    <table>
      <tbody>
        <tr><th>Bildschirm berühren und ziehen</th><td>Bewegen (wo du zuerst tippst, ist die Mitte des Sticks)</td></tr>
        <tr><th>Ⅱ oben rechts</th><td>Pause</td></tr>
      </tbody>
    </table>

    <h3>Steuerung am PC</h3>
    <table>
      <tbody>
        <tr><th>WASD / Pfeiltasten</th><td>Bewegen</td></tr>
        <tr><th>P / Esc</th><td>Pause (in Menüs geht Esc zurück wie die Schaltfläche „‹ Zurück“ oben links)</td></tr>
        <tr><th>1–4</th><td>Level-up-Auswahl treffen</td></tr>
      </tbody>
    </table>
`,
};
