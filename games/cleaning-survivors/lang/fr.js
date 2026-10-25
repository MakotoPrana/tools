// おそうじサバイバー: フランス語の文言。text は script.js の TEXT と同じキー、ほかは EN_* と同じ形。help は遊び方の HTML
(window.CS_I18N = window.CS_I18N || {}).fr = {
  text: {
    pageTitle: "Cleaning Survivors",
    pageDesc: "Un jeu d'action façon Vampire Survivors : balayez des vagues de déchets et de crasse avec un équipement de ménage qui attaque tout seul. 10 niveaux en Normal et Difficile. Nettoyez toutes les pièces en moins de 10 minutes.",
    gameTitle: "Cleaning Survivors",
    backToGames: "‹ Jeux",
    pause: "Pause",
    compress: "Compresser",
    board: "Écran de jeu",
    language: "Langue",
    warn: (name) => `Alerte ! ${name} approche !`,
    rush: "Vague de déchets !",
    tooTough: "Trop solide ! Nettoyez autour",
    shieldDmg: (n) => `DÉG ${n} %`,
    shieldNone: "Pas de barrière",
    bossDown: (name) => `${name} nettoyé !`,
    srcLeft: (room, n) => `Source détruite ! (${room} : encore ${n})`,
    srcAll: (room) => `Toutes les sources de « ${room} » sont détruites !`,
    dumped: (c) => `Déchets vidés ! +${c} pièces`,
    roomDone: (room, bonus) => `${room} : impeccable ! ${bonus}`,
    roomTreasure: (room) => `${room} : impeccable ! Un trésor est apparu !`,
    timeUp: "Temps écoulé…",
    allClean: "Toutes les pièces sont propres !",
    dumpLabel: "BENNE",
    hudDone: (room) => `${room} : fini !`,
    hudRooms: (d, n) => `Pièces ${d}/${n} finies`,
    hudSrc: (s, d, n) => `Sources ${s} · Pièces ${d}/${n} finies`,
    hudKills: (k) => `Nettoyés ${k}`,
    hudHp: (a, b) => `PV ${a}/${b}`,
    hudBoxFull: "PLEIN !",
    hudBox: (a, b) => `Bac à poussière ${a}/${b}`,
    completion: "Progression",
    completionMeta: (c, ct, tr, tt) => `Victoires ${c}/${ct} · Trésors ${tr}/${tt}`,
    logoSmall: "FROTTER · BALAYER · SURVIVRE",
    logo: "CLEANING<br>SURVIVORS",
    tagline: "Balayez des vagues de déchets et de crasse avec votre équipement de ménage !",
    play: "Jouer",
    cleaners: "Agents",
    tutorial: "Tutoriel",
    tutAskTitle: "Nouveau venu ?",
    tutAskText: "Voulez-vous d'abord apprendre les bases dans le <b>tutoriel</b> ? Vous nettoierez une petite maison de trois pièces en <b>2 à 3 minutes</b>, guidé par des conseils.",
    tutAskPlay: "Jouer au tutoriel",
    tutAskSkip: "Passer",
    tutAskNote: "Si vous passez, ce message ne s'affichera plus. Le tutoriel reste accessible à tout moment depuis l'écran titre ou le choix du niveau.",
    tutorialMeta: "Une petite maison de trois pièces pour apprendre les bases en 2 à 3 minutes",
    recommended: "Débutants",
    toStage1: "Aller au niveau 1",
    noteTutorial: "Tutoriel terminé ! Attaquez maintenant le niveau 1, « La maison des déchets : rez-de-chaussée »",
    noteTutorialRetry: "Retentez le tutoriel",
    tutMove: "Commencez par marcher. Déplacez-vous avec <b>ZQSD / WASD / flèches</b> (sur mobile, faites glisser le doigt sur l'écran). Votre équipement attaque <b>tout seul</b>",
    tutKill: "Approchez-vous des déchets. Votre équipement abîme <b>automatiquement</b> ceux qui sont proches. Surveillez la <b>jauge de PV</b> sous votre personnage",
    tutDust: "Les déchets nettoyés laissent de la <b>poussière</b> (losanges). Ramassez-la pour gagner de l'expérience et <b>monter de niveau</b>",
    tutLevelUp: (a, b) => `Niveau supérieur ! Choisissez un équipement ou un passif. Vous ne pouvez porter que ${a} équipements et ${b} passifs : réfléchissez à votre combinaison`,
    tutSource: "Le cercle rouge en pointillés est une <b>source</b> : c'est de là que sortent les déchets. La jauge au-dessus est sa <b>barrière de crasse</b>, qui faiblit à mesure que vous nettoyez le sol autour. Frottez autour, puis détruisez-la",
    tutRoom: "<b>Détruisez toutes les sources</b> d'une pièce et nettoyez <b>au moins 90 %</b> de son sol pour la finir. Le % en haut à droite indique la propreté de la pièce",
    tutChest: "Pièce finie ! Vous gagnez un <b>coffre</b> et un bonus de pièce. Ramassez le coffre pour l'ouvrir",
    tutDump: "La poussière ramassée remplit la <b>poubelle</b> (bac à poussière) en bas à gauche. <b>Pleine, elle divise vos dégâts par deux, vous empêche de ramasser la poussière et vous ralentit</b>. Placez-vous sur la <b>benne verte</b> présente dans chaque pièce pour la vider",
    tutDanger: "Plus une pièce a de ★, plus elle est sale et ses déchets coriaces : <b>commencez par celles qui en ont peu</b>. Dans les vrais niveaux, vous gagnez en nettoyant <b>toutes les pièces en moins de 10 minutes</b>. Finissez les pièces restantes !",
    achievements: "Succès",
    achClears: "Victoires par agent (bonus)",
    settings: "Réglages",
    stageSelect: "Choisir un niveau",
    recordOf: (name) => `Records de ${name}`,
    coins: "Pièces",
    hardNote: "Difficile : PV et dégâts des déchets et des sources environ 3 à 7 fois ceux du mode Normal (selon le niveau), nombre ×1,2. Pièces ×1,6. Montez vos compétences permanentes à environ la moitié d'abord. Le dernier niveau reste du 50/50 même à 80 %.",
    lockedPrev: "Terminez le niveau précédent en Normal pour entrer",
    lockedHard: "Terminez ce niveau en Normal pour débloquer le mode Difficile",
    bestRooms: (r, n) => `Meilleur : ${r}/${n} pièces`,
    bestClear: (time) => `Meilleur temps ${time}`,
    roomCount: (n) => `${n} pièces`,
    badgeTreasure: "T",
    treasure: "Trésor",
    skills: "Compétences",
    zukan: "Guide des déchets",
    toTitle: "Titre",
    unlockText: (n, stage) => `Rejoint l'équipe quand vous trouvez le trésor du niveau ${n}, « ${stage} »`,
    trait: (name, desc) => `Talent « ${name} » : ${desc}`,
    charStats: (hp, gears) => `PV ${hp} · Équipement de départ : ${gears}`,
    sep: ", ",
    stageTitle: (n, name) => `Niveau ${n} : ${name}`,
    planAlt: "Plan",
    briefDesc: "<b>Nettoyez toutes les pièces en moins de 10 minutes</b> pour terminer le niveau. Détruisez toutes les <b>sources</b> (points rouges) d'une pièce et faites briller son sol pour la finir et gagner un coffre et un bonus. <b>Plus une pièce a de ★, plus elle est sale</b>, avec des déchets plus nombreux et plus coriaces. Si vous y entrez trop tôt, vous serez vite débordé : commencez par les pièces qui ont peu de ★. Les sources sont <b>d'autant plus solides que leurs alentours sont sales</b>, alors frottez autour d'abord.",
    srcCount: (n) => `Sources ${n}`,
    treasureFoundLine: (name) => `Trésor « ${name} » trouvé !`,
    treasureHint: (st, room) => `Trésor : finissez la pièce ${st} « ${room} » pour le trouver`,
    joined: (name) => `${name} a rejoint l'équipe`,
    willJoin: "Trouver ce trésor débloque un nouvel agent",
    bossNote: (mid, boss) => `Le mini-boss « ${mid} » apparaît à 5:00, et le boss « ${boss} » à 9:00.`,
    cleared: "Terminé",
    pickCleaner: "Choisissez votre agent",
    deploy: (mode) => `Partir (${mode})`,
    back: "Retour",
    charsSub: "Records bonus pour les perfectionnistes ; ils ne comptent pas dans la progression. Choisissez un agent pour voir ses victoires par niveau et par mode",
    treasures: (a, b) => `Trésors (${a}/${b})`,
    roomsCell: (r, n) => `${r}/${n} pièces`,
    clears: (a, b) => `Victoires ${a}/${b}`,
    stage: "Niveau",
    useCleaner: "Choisir cet agent",
    planStart: "DÉPART",
    paused: "Pause",
    pauseSub: (stage, left, d, n) => `${stage} · reste ${left} · Pièces nettoyées ${d}/${n}`,
    resume: "Reprendre",
    retry: "Recommencer",
    toStages: "Choix du niveau",
    onigiri: "Onigiri",
    onigiriDesc: "Rend 50 PV",
    savings: "Bas de laine",
    savingsDesc: "Pièces +10",
    evoWith: (p) => `Évolue avec ${p}`,
    evoChest: "Ouvrez un coffre pour évoluer !",
    evoNeed: (p) => `Peut évoluer si vous avez ${p}`,
    evoFor: (w) => `Nécessaire pour faire évoluer ${w}`,
    pickOne: "Choisissez un équipement ou un passif",
    tagGear: "Équip.",
    canUpgrade: (n) => `${n} améliorations possibles`,
    shopCta: (c, n) => `Vous avez ${c} pièces ! ${n} améliorations de compétences permanentes sont possibles, et elles valent pour toutes les parties suivantes`,
    recipeAria: (g, p, e) => `${g} + ${p} évolue en ${e}`,
    boxFullBanner: "Poubelle PLEINE ! Allez à une benne",
    boxFullNag: "PLEIN ! Impossible de ramasser",
    boxNear: "Presque plein",
    dangerWord1: "Saleté 1 · Facile",
    dangerWord2: "Saleté 2 · Normal",
    dangerWord3: "Saleté 3 · Coriace",
    dangerWord4: "Saleté 4 · Danger !",
    dangerWord5: "Saleté 5 · Extrême !!",
    tagPassive: "Passif",
    inventory: "Votre inventaire",
    emptySlot: "Vide",
    slots: (g, gm, p, pm) => `Équipement ${g}/${gm} · Passifs ${p}/${pm}`,
    slotNote: (g, p) => `Vous ne pouvez porter que ${g} équipements et ${p} passifs : votre combinaison décide de votre façon de combattre.`,
    reroll: (n) => `Relancer (reste ${n})`,
    treasureNew: "Trésor trouvé !",
    owned: " (déjà possédé)",
    joinedBang: (name) => `${name} rejoint l'équipe !`,
    evolved: "ÉVOLUTION !!",
    evolvedText: (w, e, d) => `${w} a évolué en « ${e} » ! ${d}`,
    chest: "Coffre",
    coins30: "Pièces +30",
    noteAllRooms: "Toutes les pièces sont nettoyées !",
    noteTreasure: (name) => `Trésor « ${name} » trouvé !`,
    noteStage: (n, name) => `Le niveau ${n}, « ${name} », est maintenant ouvert !`,
    noteHard: "Le mode Difficile de ce niveau est maintenant ouvert !",
    noteAll: "Tout le manoir étincelle ! Félicitations !",
    noteFirst: (c, m) => `Première victoire en ${m} avec ${c} !`,
    wornOut: "À bout de forces…",
    resultSub: (stage, mode, c) => `${stage} · ${mode} · ${c}`,
    clearTime: "Temps",
    playTime: "Temps de jeu",
    roomsCleaned: "Pièces nettoyées",
    houseClean: "Propreté (toute la maison)",
    kills: "Déchets nettoyés",
    level: "Niveau",
    coinKills: "Pièces (déchets)",
    coinClean: "Pièces (propreté)",
    coinDump: "Pièces (bennes et coffres)",
    coinRoom: "Pièces (pièces et sources)",
    coinBoss: "Pièces (boss)",
    coinClear: "Pièces (victoire)",
    coinMul: (hard) => `Multiplicateur (${hard ? "Difficile, " : ""}compétences)`,
    total: "Total",
    nextStage: "Niveau suivant",
    again: "Réessayer",
    shopSub: "Valable pour tous les agents, dès la prochaine partie",
    max: "MAX",
    cost: (c) => `${c} pièces`,
    killed: (n) => `Nettoyés ${n}`,
    se: "Effets sonores",
    bgm: "Musique",
    shake: "Secousses et flashs",
    haze: "Brume de crasse",
    reviveTitle: "On remet ça ?",
    reviveText: "Relevez-vous sur place avec tous vos PV.",
    reviveBtn: "Revivre",
    giveUp: "Abandonner",
    revived: "De retour ! On continue !",
    rerollPlus: "+2 relances",
    coinsX: (n) => `Pièces ×1,5 (+${n})`,
    coinAd: "Pièces (bonus ×1,5)",
    withAd: (s) => `📺 Regarder une pub : ${s}`,
    adLoading: "Chargement de la pub…",
    adFailed: "Impossible de charger une pub. Patientez un instant et réessayez",
    howToPlay: "Comment jouer",
    perkReroll: "Relance",
    perkRerollDesc: "Une relance au niveau supérieur à chaque partie",
    perkRevive: "Renaissance",
    perkReviveDesc: "Une fois par partie, relevez-vous avec tous vos PV quand vous êtes à bout de forces",
    perkHow: (n, mode) => `Débloqué en trouvant le trésor du niveau ${n} (${mode})`,
    perkOn: "Débloqué (par un trésor)",
    perkGot: (name) => `Compétence permanente « ${name} » débloquée !`,
    perkTeaser: (name) => `Débloque la compétence permanente « ${name} »`,
    treasureClue: (stage, mode) => `Indice : dans ${stage} (${mode}), il dort au fond de la pièce la plus sale`,
    treasurePerks: "Compétences débloquées par des trésors",
    reviveFree: "Revivre grâce au trésor",
  },
  enemies: {
    dust: ["Mouton de poussière", "Faible, mais arrive en énormes nuées. Présent dans toutes les pièces."],
    hair: ["Boule de cheveux", "Mêlée à la poussière. Elle s'emmêle autour de vous et vous ralentit un peu."],
    paper: ["Boulette de papier", "Le déchet le plus ordinaire. Vous fonce droit dessus."],
    can: ["Canette vide", "Roule vers vous et vous percute. Ça fait mal."],
    bottle: ["Bouteille en plastique", "Plus rapide et plus solide qu'une canette. Rebondit sur les murs."],
    grease: ["Graisse collante", "Un slime gluant. Salit le sol où il passe et vous ralentit beaucoup au contact."],
    spore: ["Spore de moisissure", "Garde ses distances et répand des spores. Les respirer provoque une allergie qui draine les PV."],
    bag: ["Sac poubelle", "Éclate quand on le nettoie et répand les déchets qu'il contient."],
    pile: ["Tas d'ordures", "Une source qui fait sortir des déchets et salit le sol tant qu'elle n'est pas détruite."],
    drain: ["Évacuation bouchée", "Une source qui crache de la graisse collante et des cheveux."],
    nest: ["Nid de moisissure", "Une source de spores. Le spray désinfectant est très efficace dessus."],
    boxes: ["Tas de cartons", "Une source d'où roulent des boulettes de papier et des canettes."],
    yokai: ["Goule des ordures", "Le mini-boss qui apparaît à 5:00. Sème des déchets en s'approchant."],
    kaiju: ["Monstre de moisissure", "Le boss qui apparaît à 9:00. Couvre le sol de moisissure et tire des spores."],
    master: ["Seigneur de la maison des déchets", "Le boss de la salle du maître. Il contrôle toute la maison des déchets."],
  },
  weapons: {
    vacuum: ["Aspirateur turbo", "Pointe une buse en cône vers les déchets proches et abîme tout ce qui s'y trouve.",
      ["Dégâts +2", "Portée d'aspiration +15", "Angle d'aspiration +15°", "Dégâts +3", "Intervalle d'aspiration −0,06 s", "Portée d'aspiration +20", "Dégâts +4, angle +15°"]],
    washer: ["Nettoyeur haute pression", "Tire un jet d'eau sur les déchets proches, qui les transperce et les repousse.",
      ["Jets +1", "Dégâts +5", "Largeur du jet +5", "Jets +1", "Dégâts +6", "Portée +80, intervalle −0,2 s", "Jets +1, dégâts +6"]],
    robot: ["Robot nettoyeur", "Tourne autour de vous, broie les déchets et fait briller le sol.",
      ["Robots +1", "Dégâts +3", "Rayon d'orbite +16", "Robots +1", "Rotation plus rapide, dégâts +3", "Taille du robot +4", "Robots +1"]],
    spray: ["Spray désinfectant", "Laisse autour de vous une brume désinfectante qui persiste. Dégâts doublés contre la moisissure.",
      ["Brumes +1", "Taille de la brume +8", "Dégâts +2", "Durée +0,6 s", "Brumes +1", "Taille de la brume +10", "Dégâts +3, brumes +1"]],
    roller: ["Rouleau adhésif", "Vous suit et ramasse les déchets et la saleté sur votre passage.",
      ["Dégâts +3", "Largeur +8", "Dégâts +3", "Rouleaux +1", "Largeur +8", "Dégâts +4", "Rouleaux +1"]],
    mop: ["Serpillière", "Balaie un large arc devant vous, repousse les déchets et frotte le sol à fond.",
      ["Dégâts +4", "Allonge +12", "Intervalle −0,12 s", "Dégâts +5", "Angle de balayage +40°", "Allonge +16", "Dégâts +6, intervalle −0,1 s"]],
    duster: ["Plumeau", "Lancé comme un boomerang, il chasse les déchets à l'aller et au retour. Transperce.",
      ["Dégâts +3", "Plumeaux +1", "Distance +40", "Taille +4, dégâts +3", "Plumeaux +1", "Intervalle −0,25 s", "Dégâts +5, plumeaux +1"]],
    bomb: ["Bombe de détergent", "Lance du détergent dans les groupes de déchets ; la mousse qui éclate les nettoie tous.",
      ["Dégâts +6", "Taille de l'explosion +10", "Bombes +1", "Intervalle −0,3 s", "Dégâts +8", "Taille de l'explosion +12", "Bombes +1, dégâts +6"]],
    purifier: ["Purificateur d'air", "Garde l'air propre autour de vous, abîme peu à peu et repousse les déchets qui approchent.",
      ["Rayon +8", "Dégâts +2", "Intervalle −0,08 s", "Rayon +10", "Dégâts +3", "Rayon +10, intervalle −0,06 s", "Dégâts +4"]],
    press: ["Compacteur", "Tasse petit à petit le contenu du bac à poussière pour libérer une onde de choc. Plus il y a de poussière, plus elle est forte, et le bac se vide aussi.",
      ["Taille de l'onde +20", "Dégâts +4", "Intervalle −0,6 s", "Quantité tassée +5 %", "Taille de l'onde +25", "Dégâts +6", "Intervalle −0,7 s, quantité tassée +5 %"]],
    sponge: ["Éponge magique", "Rebondit sur les murs en volant dans la pièce et décape déchets et saleté.",
      ["Dégâts +3", "Éponges +1", "Temps de vol +1 s", "Taille +4", "Dégâts +4, plus rapide", "Éponges +1", "Dégâts +5, temps de vol +1 s"]],
  },
  evos: {
    blackhole: ["Aspirateur trou noir", "Place devant vous un vortex d'aspiration qui abîme tous les déchets qu'il contient."],
    steam: ["Canon à vapeur surchauffée", "Un rayon de vapeur épais et long qui fait briller d'un coup toute sa trajectoire."],
    army: ["Escouade de robots", "Les robots cherchent seuls la saleté et les déchets et patrouillent dans la pièce."],
    acid: ["Brume de pluie acide", "Fait pleuvoir du désinfectant sur tout l'écran."],
    giant: ["Rouleau compresseur géant", "Un énorme rouleau qui fait briller tout votre passage et écrase les déchets."],
    tornado: ["Serpillière tornade", "Balaie sans arrêt tout autour de vous à grande vitesse."],
    gale: ["Plumeau du dieu du vent", "Plusieurs grands plumeaux s'envolent et ramènent la poussière sur leur passage."],
    foam: ["Explosion de mousse", "D'énormes explosions laissent une mousse qui dissout les déchets pendant un moment."],
    aura: ["Barrière purifiante", "Une immense barrière qui brûle les déchets et ralentit tout ce qui s'y trouve."],
    megapress: ["Méga-compacteur", "Une onde de choc qui couvre l'écran et nettoie aussi le sol d'un coup."],
    meteor: ["Pluie d'éponges", "De grosses éponges rebondissent longtemps et font briller toute la pièce."],
  },
  passives: {
    battery: ["Batterie supplémentaire", "Intervalle d'attaque de l'équipement −8 %"],
    boiler: ["Chauffe-eau", "Dégâts de l'équipement +10 %"],
    roomba: ["Robot nettoyeur en plus", "Nombre d'équipements +1 (jets, robots, brumes, plumeaux, bombes, éponges)"],
    bleach: ["Javel puissante", "Zone d'attaque +10 %"],
    tape: ["Ruban super collant", "Durée des effets +10 %"],
    dustpack: ["Grand sac à poussière", "Capacité du bac +40, portée de ramassage +20 %"],
    boots: ["Bottes de pluie", "Ralentissement sur sol sale réduit de moitié, PV +20"],
    gloves: ["Gants en caoutchouc", "Dégâts subis −1"],
    hydraulic: ["Vérin hydraulique", "Recul infligé +25 %, capacité du bac +15"],
    filter: ["Filtre HEPA", "Régénère 0,25 PV par seconde"],
    wax: ["Cire pour sol", "Vitesse de déplacement +6 %, vitesse des projectiles +10 %"],
  },
  chars: {
    cleaner: ["Hajime le nettoyeur", "Pro du lustrage", "Rayon de nettoyage en marchant +40 %", "Un nettoyeur légendaire. Un vétéran sérieux qui ne laisse passer aucune tache."],
    mizuki: ["Mizuki la laveuse", "Fana de pression", "Dégâts +15 %", "Une laveuse impatiente qui adore son nettoyeur haute pression."],
    runta: ["Runta le robot", "Roues tout-terrain", "Pas ralenti par les sols sales", "Un robot nettoyeur construit d'après les plans du débarras."],
    koroko: ["Koroko au rouleau", "Ramasseuse hors pair", "Portée de ramassage +40 %, bac +40", "Une fille qui adore ranger et a hérité du rouleau adhésif légendaire."],
    kiyoshi: ["Dr Kiyoshi", "Immunité de fer", "Immunisé contre les allergies, +50 % de dégâts contre la moisissure", "Un docteur dévoué à l'étude des moisissures. Il cherchait son carnet perdu."],
    tome: ["Mamie Tome", "Sagesse de l'âge", "Commence avec 2 équipements, EXP +25 %", "L'ancienne gardienne du manoir. Lente sur ses jambes, mais personne n'égale sa sagesse et son expérience."],
  },
  bonus: {
    speed: "Vitesse de déplacement +10 %",
    magnet: "Portée de ramassage +25 %",
    hp: "PV max +20",
    regen: "Régénère 0,5 PV/s",
    might: "Dégâts +10 %",
    cd: "Intervalle d'attaque −6 %",
    box: "Capacité du bac +40",
    armor: "Dégâts subis −1",
    area: "Zone d'attaque +10 %",
    heal: "Rend tous les PV",
  },
  shop: {
    hp: ["Santé", "PV max +12"],
    might: ["Puissance", "Dégâts +8 %"],
    clean: ["Pouvoir nettoyant", "Rayon de nettoyage en marchant +12 %, zone nettoyée par l'équipement +6 %"],
    speed: ["Vitesse", "Vitesse de déplacement +4 %"],
    armor: ["Défense", "Dégâts subis −1"],
    regen: ["Régénération", "Régénère 0,2 PV/s"],
    magnet: ["Portée de ramassage", "Portée de ramassage +10 %"],
    xp: ["Expérience", "EXP gagnée +8 %"],
    box: ["Bac à poussière", "Capacité +20"],
    coin: ["Pièces", "Pièces gagnées +10 %"],
    choices: ["Choix", "Choix au niveau supérieur 3 → 4"],
  },
  modes: { normal: "Normal", hard: "Difficile" },
  stages: [
    ["La maison des déchets : rez-de-chaussée", "Autour du salon. Surtout de la poussière, du papier et des canettes.",
      { genkan: "Entrée", rouka: "Couloir", living: "Salon", washitsu: "Pièce à tatamis", dining: "Salle à manger" },
      ["Album de famille", "Un vieil album de la famille du manoir, retrouvé sous les déchets."]],
    ["La cuisine maudite", "Beaucoup de graisse et d'ordures. Les évacuations crachent de la graisse et le sol se resalit vite.",
      { rouka: "Couloir", dining: "Salle à manger", kitchen: "Cuisine", pantry: "Garde-manger", laundry: "Buanderie", katte: "Porte de service" },
      ["Robinet doré", "Un robinet étincelant en or massif. Une certaine experte de l'eau en rêve depuis toujours."]],
    ["Les salles d'eau moisies", "Pleines de spores de moisissure. Le sol de la salle de bain est glissant.",
      { rouka: "Couloir", bath: "Salle de bain", datsui: "Vestiaire", toilet: "Toilettes", senmen: "Lavabos" },
      ["Savon perlé", "Un savon mystérieux dont la mousse brille comme des perles."]],
    ["Le débarras scellé et l'étage", "Le débarras et le placard sont remplis de cartons, et les passages sont étroits.",
      { kids: "Chambre d'enfant", study: "Bureau", hall: "Palier", storage: "Débarras", nando: "Placard" },
      ["Plans du robot", "Les plans d'un robot nettoyeur, cachés au fond du débarras."]],
    ["Le jardin envahi", "Un jardin divisé par des haies. L'étang est couvert de moisissure.",
      { gate: "Portail", path: "Allée", front: "Jardin de devant", flower: "Parterre", yard: "Étendoir", shed: "Cabane", pond: "Bord de l'étang" },
      ["Trèfle à quatre feuilles", "Un trèfle porte-bonheur, le seul à pousser au bord de l'étang."]],
    ["Le grenier poussiéreux", "Un grenier où tourbillonnent poussière et cheveux. Des cartons partout.",
      { stairs: "Escalier du grenier", passage: "Passage", oldclothes: "Pièce aux vieux habits", chests: "Coin des malles", skylight: "Pièce à la lucarne", nook: "Recoin", secret: "Pièce secrète" },
      ["Rouleau adhésif légendaire", "Un rouleau adhésif légendaire qui ramasserait n'importe quel déchet."]],
    ["La chaufferie du sous-sol", "Un sous-sol envahi par la graisse et la moisissure. La chaufferie est pleine d'évacuations.",
      { under: "Sous l'escalier", corridor: "Couloir du sous-sol", cellar: "Cave à vin", washroom: "Coin lavage", boiler: "Chaufferie", store: "Réserve" },
      ["Vieille montre à gousset", "Une montre trouvée derrière la chaudière. Elle fait encore tic-tac."]],
    ["Le garage à bric-à-brac", "Un garage jonché de canettes et de bouteilles. La remise du fond est une montagne de cartons.",
      { side: "Porte latérale", bench: "Établi", garage: "Garage", tools: "Coin des outils", tires: "Tas de pneus", back: "Remise du fond" },
      ["Carnet du Dr Désinfectant", "Les notes d'un docteur qui a combattu la moisissure pendant des années. Son propriétaire le cherche."]],
    ["La salle de banquet hantée", "La grande salle après la fête. Des montagnes d'ordures et de graisse.",
      { lobby: "Hall", cloak: "Vestiaire", pantry: "Office", hall: "Salle de banquet", stage: "Scène", green: "Loge" },
      ["Chandelier en argent", "Un chandelier oublié sur la scène. Le préféré des fantômes."]],
    ["La salle du maître", "Le dernier niveau, où apparaissent tous les déchets. Le boss est le Seigneur de la maison des déchets.",
      { shoko: "Bibliothèque", bedroom: "Chambre", closet: "Garde-robe", hall: "Grand salon", master: "Chambre du maître" },
      ["Clé du manoir", "Une vieille clé qui ouvre toutes les portes du manoir. Elle appartenait à l'ancienne gardienne."]],
  ],
  hardTreasures: [
    ["Chat porte-bonheur", "Un maneki-neko doré enfoui sur le meuble à chaussures de l'entrée."],
    ["Louche en argent", "La lourde louche en argent que le cuisinier du manoir adorait."],
    ["Dé de la chance", "Un dé trouvé au fond de la baignoire, qui permettrait de relancer son destin."],
    ["Poupée mécanique", "Une vieille poupée qui balaie le sol avec un petit balai quand on la remonte."],
    ["Arrosoir doré", "Un arrosoir doré étincelant, enfoui dans le parterre."],
    ["Plumeau du phénix", "Un plumeau caché au fond du grenier, qui renaîtrait encore et encore."],
    ["Engrenage en laiton", "Un gros engrenage brillant détaché du cœur de la chaudière."],
    ["Radio rétro", "Une vieille radio sortie du tas de bric-à-brac. Elle marche encore."],
    ["Invitation fantôme", "Une vieille invitation où figurent les noms des fantômes conviés au banquet."],
    ["Pelle à poussière dorée", "Une pelle à poussière en or massif que le Seigneur n'a jamais lâchée."],
  ],
  tutorial: ["Tutoriel", "Une petite maison de trois pièces pour apprendre à jouer.", { genkan: "Entrée", living: "Salon", washitsu: "Pièce à tatamis" }],
  help: `
    <h2>Comment jouer</h2>
    <p>Débarrassez une maison encombrée de ses déchets avec votre équipement de ménage et <b>faites briller toutes les pièces en moins de 10 minutes</b>. Vous ne contrôlez que vos déplacements : l'équipement attaque tout seul. Les déchets nettoyés laissent de la poussière, que vous ramassez comme expérience. À chaque niveau, choisissez un nouvel équipement ou un passif pour devenir plus fort. Vous échouez si le temps est écoulé ou si vos PV tombent à zéro.</p>

    <h3>Tutoriel</h3>
    <p>Si vous débutez, commencez par « Tutoriel » sur l'écran titre (il vous est aussi proposé la première fois que vous appuyez sur « Jouer »). Vous nettoyez une petite maison de trois pièces en 2 à 3 minutes, guidé par des conseils en bas de l'écran et une flèche verte : déplacement, montée de niveau, sources, fin d'une pièce, coffres et bennes. Le tutoriel ne compte pas dans la progression.</p>

    <h3>Plans et sources</h3>
    <p>Il y a 10 niveaux. Chaque niveau est une maison de 5 à 7 pièces séparées par des murs et des portes. Les pièces contiennent des « sources » entourées d'un cercle rouge en pointillés (tas d'ordures, évacuations, nids de moisissure, tas de cartons), d'où sortent la plupart des déchets. Les sources salissent le sol autour d'elles tant qu'elles ne sont pas détruites. Elles sont aussi protégées par une « barrière de crasse » (un film brun) qui les rend d'autant plus solides que le sol autour est sale. Au-dessus de chaque source s'affichent la force de la barrière (jauge à 5 crans) et la part de vos dégâts qui passe (par ex. « DÉG 12 % »). Plus la jauge est rouge, plus la source est solide. Nettoyer autour fait baisser la jauge et rend vos attaques efficaces : frottez autour d'abord. Plus vous détruisez de sources, moins il apparaît de déchets. La mini-carte en haut à gauche montre la saleté de chaque pièce et l'emplacement des sources (en rouge).</p>

    <h3>Niveau de saleté des pièces (★)</h3>
    <p>Chaque pièce a un niveau de saleté de ★1 à ★5. Plus il y a de ★, plus la pièce est sale, avec des sources plus nombreuses et plus solides et des déchets bien plus nombreux et plus forts (la graisse et la moisissure apparaissent dès ★3, les sacs poubelle dès ★4). Les déchets d'une pièce y errent jusqu'à ce que vous entriez ou approchiez. Entrer dans une pièce ★5 à bas niveau, c'est être vite submergé : commencez par les pièces qui ont peu de ★ et renforcez-vous. Les déchets des pièces à nombreuses ★ laissent plus souvent de grosses poussières.</p>

    <h3>Finir une pièce</h3>
    <p>Détruisez toutes les sources d'une pièce et nettoyez au moins 90 % de son sol pour la finir (le reste se lustre tout seul). Vous gagnez un coffre et un bonus propre à la pièce (déplacement plus rapide, PV max en plus, etc.), et la pièce ne se salit plus jamais.</p>

    <h3>Normal et Difficile</h3>
    <p>Chaque niveau a un mode Normal et un mode Difficile. Terminer un niveau en Normal débloque le niveau suivant et le mode Difficile de ce niveau. En Difficile, les déchets sont beaucoup plus nombreux et coriaces, et il est presque impossible de gagner tant que vos compétences permanentes ne sont pas à environ la moitié (le dernier niveau en Difficile reste du 50/50 même à 80 %). Dépensez vos pièces en « compétences permanentes » avant de vous y attaquer (le mode Difficile rapporte 1,6 fois plus de pièces).</p>

    <h3>Compétences permanentes</h3>
    <p>Dépensez les pièces gagnées pour augmenter santé, puissance, pouvoir nettoyant (largeur de nettoyage du sol), vitesse, défense, régénération, portée de ramassage, expérience, taille du bac à poussière, pièces et nombre de choix au niveau supérieur. Elles valent pour tous les agents dès la partie suivante. Ouvrez-les avec le bouton « ⬆ Compétences » sur l'écran titre ou le choix du niveau. Quand vous pouvez payer une amélioration, le bouton brille en doré et indique combien.</p>

    <h3>Boutons de récompense (revivre, relances, pièces ×1,5)</h3>
    <p>Quand vous êtes à bout de forces, vous pouvez vous relever sur place une fois par partie (tous vos PV, et les déchets proches sont balayés). Si les choix au niveau supérieur ne vous plaisent pas, vous pouvez obtenir 2 relances. Quand vous terminez un niveau, vous pouvez multiplier par 1,5 les pièces gagnées. Chaque récompense s'obtient en regardant une publicité et n'est disponible que sur CrazyGames.</p>

    <h3>Agents et trésors</h3>
    <p>Il y a 6 agents, chacun avec un équipement de départ et un talent différents (nettoie plus large en marchant, n'est pas ralenti par les sols sales, ne fait pas d'allergie, etc.). Chaque niveau cache un trésor en Normal et un en Difficile, 20 en tout ; un trésor apparaît quand vous finissez la pièce qui a le plus de ★ dans ce mode. Les trésors sont enregistrés dès que vous les ramassez. Certains trésors du mode Normal font rejoindre un nouvel agent, et deux trésors du mode Difficile débloquent les compétences permanentes Relance et Renaissance. L'écran « Succès » (depuis le titre) montre les victoires de chaque agent et les trésors récoltés, avec des indices pour ceux qui manquent.</p>

    <h3>Progression</h3>
    <p>La progression compte combien des 40 objectifs vous avez atteints : les victoires de chaque niveau dans chaque mode (10 niveaux × 2 modes = 20) et les trésors (20). N'importe quel agent peut obtenir une victoire. Les victoires de chaque agent s'affichent dans l'écran « Succès » comme records bonus, mais ne comptent pas dans la progression.</p>

    <h3>Sols sales</h3>
    <p>Le sol est sale, et plus il l'est, plus vous marchez lentement. Le sol où passe votre équipement devient propre. Sur un sol étincelant, vous marchez plus vite et ramassez la poussière de plus loin. La saleté s'étend peu à peu, et les déchets salissent là où ils passent. Tant que tout est crasseux, une brume brune couvre l'écran ; elle se dissipe à mesure que vous nettoyez autour de vous et toute la maison (désactivable dans les réglages).</p>

    <h3>Bac à poussière et bennes</h3>
    <p>La poussière ramassée va dans la poubelle (bac à poussière) en bas à gauche. <b>Pleine, elle divise par deux les dégâts de votre équipement, vous empêche de ramasser la poussière (pas d'expérience) et vous ralentit.</b> La poubelle devient orange à 80 % et clignote en rouge quand elle est pleine, et une flèche indique la benne la plus proche. Placez-vous sur la <b>benne verte présente dans chaque pièce</b> pour la vider (vous gagnez des pièces). Vos PV sont indiqués par la jauge sous votre personnage.</p>

    <h3>Builds (emplacements d'équipement et de passifs)</h3>
    <p>Il existe 11 équipements de ménage, mais en une partie vous ne pouvez porter que <b>4 équipements et 4 passifs</b>. La serpillière balaie autour de vous, le plumeau part et revient, la bombe de détergent est lancée dans les groupes de déchets, l'éponge magique rebondit sur les murs, le purificateur d'air repousse les déchets proches, le compacteur tasse le bac à poussière en onde de choc, etc. : votre combinaison change votre façon de combattre. Le mieux est de choisir un équipement avec le passif qui le fait évoluer. Les écrans de niveau et de coffre montrent votre inventaire (équipement en bleu, passifs en violet) et les recettes d'évolution (équipement + passif → icône évoluée). Quand vous entrez dans une pièce, son niveau de saleté (★) s'affiche en haut de l'écran.</p>

    <h3>Évolution</h3>
    <p>Montez un équipement au niveau 8 et ouvrez un coffre en possédant le passif correspondant pour le faire évoluer. Les coffres sont lâchés par les déchets à bordure dorée, les mini-boss et les boss.</p>
    <table>
      <tbody>
        <tr><th>Aspirateur turbo + Batterie supplémentaire</th><td>Aspirateur trou noir</td></tr>
        <tr><th>Nettoyeur haute pression + Chauffe-eau</th><td>Canon à vapeur surchauffée</td></tr>
        <tr><th>Robot nettoyeur + Robot nettoyeur en plus</th><td>Escouade de robots</td></tr>
        <tr><th>Spray désinfectant + Javel puissante</th><td>Brume de pluie acide</td></tr>
        <tr><th>Rouleau adhésif + Ruban super collant</th><td>Rouleau compresseur géant</td></tr>
        <tr><th>Serpillière + Gants en caoutchouc</th><td>Serpillière tornade</td></tr>
        <tr><th>Plumeau + Bottes de pluie</th><td>Plumeau du dieu du vent</td></tr>
        <tr><th>Bombe de détergent + Grand sac à poussière</th><td>Explosion de mousse</td></tr>
        <tr><th>Éponge magique + Cire pour sol</th><td>Pluie d'éponges</td></tr>
        <tr><th>Purificateur d'air + Filtre HEPA</th><td>Barrière purifiante</td></tr>
        <tr><th>Compacteur + Vérin hydraulique</th><td>Méga-compacteur</td></tr>
      </tbody>
    </table>

    <h3>Commandes sur smartphone</h3>
    <table>
      <tbody>
        <tr><th>Toucher l'écran et faire glisser</th><td>Se déplacer (l'endroit touché devient le centre du joystick)</td></tr>
        <tr><th>Ⅱ en haut à droite</th><td>Pause</td></tr>
      </tbody>
    </table>

    <h3>Commandes sur ordinateur</h3>
    <table>
      <tbody>
        <tr><th>WASD / ZQSD / Flèches</th><td>Se déplacer</td></tr>
        <tr><th>P / Échap</th><td>Pause (dans les menus, Échap revient en arrière comme le bouton « ‹ Retour » en haut à gauche)</td></tr>
        <tr><th>1–4</th><td>Choisir au niveau supérieur</td></tr>
      </tbody>
    </table>
`,
};
