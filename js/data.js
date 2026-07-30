// Statische Trainingsdaten: Uebungsanleitungen, Uebungsliste, Muskelgruppen- und Level-Labels
// Keine Abhaengigkeiten zu anderen Dateien.

export const EXERCISE_INSTRUCTIONS = {
  "squat": {
    "steps": [
      "1. Setup: Füße schulterbreit, Zehen leicht nach außen.",
      "2. Ausführung: Knie über die Zehen führen, Rücken aufrecht, bis Oberschenkel parallel zum Boden absenken, dann hochdrücken."
    ],
    "note": null
  },
  "backsquat": {
    "steps": [
      "1. Setup: Langhantel in J-Hooks auf Schulterhöhe, Stange auf dem oberen Rücken/Nacken platzieren, aus den Hooks heben und einen Schritt zurücktreten.",
      "2. Ausführung: Hüfte nach hinten schieben, in die Knie gehen bis Oberschenkel parallel, dann kraftvoll hochdrücken."
    ],
    "note": "⚠️ Safety Arms passend zur Kniebeuge-Tiefe einstellen, bevor du startest."
  },
  "rdl": {
    "steps": [
      "1. Setup: Langhantel schulterbreit greifen, Stange direkt vor den Schienbeinen.",
      "2. Ausführung: Hüfte nach hinten schieben, Stange nah am Körper bis knapp unter die Knie senken, Rücken gerade halten, dann über die Hüfte wieder aufrichten."
    ],
    "note": null
  },
  "nordic": {
    "steps": [
      "1. Setup: Untere Latzug-Rolle am Rack so weit runterstellen, dass sie knapp über dem Boden liegt. Unterlage/Matte unter die Knie legen und Fußspitzen fest unter der Rolle einklemmen.",
      "2. Ausführung: Aufrecht kniend starten, Oberkörper langsam und kontrolliert nach vorne absenken, dabei Rücken und Hüfte gerade halten (kein Knick in der Hüfte).",
      "3. Am tiefsten Punkt mit den Händen kurz abfangen, dann mit Kraft der Beinbeuger wieder nach oben ziehen."
    ],
    "note": "⚠️ Sehr intensive Übung für die Beinbeuger – anfangs nur wenige Wiederholungen und langsam absenken, notfalls mit den Händen abstützen."
  },
  "kickback": {
    "steps": [
      "1. Setup: Schlaufengriff am unteren Kabelzug um den Knöchel legen, seitlich zum Rack stellen und mit einer Hand festhalten.",
      "2. Ausführung: Bein gestreckt nach hinten drücken bis zur maximalen Streckung der Hüfte, kontrolliert zurückführen."
    ],
    "note": null
  },
  "legextensioncable": {
    "steps": [
      "1. Setup: Fußschlaufe am unteren Kabelzug (Ruderzug) einhängen, auf der Hantelbank sitzen, Schlaufe um den Knöchel legen, Kette so einstellen, dass leichte Vorspannung besteht.",
      "2. Ausführung: Unterschenkel nach vorne strecken bis das Bein fast gerade ist, oben kurz anspannen, dann kontrolliert wieder absenken."
    ],
    "note": "💡 Auf stabile Sitzposition achten, Oberkörper ruhig halten, nur das Kniegelenk bewegt sich."
  },
  "legcurlcable": {
    "steps": [
      "1. Setup: Fußschlaufe direkt am unteren Kabelzug (Ruderzug) einhängen, stehend davor positionieren, Knie am Kniepolster/Anschlag abstützen.",
      "2. Ausführung: Fuß Richtung Gesäß nach oben ziehen, Oberkörper stabil und aufrecht halten, dann kontrolliert wieder strecken."
    ],
    "note": "💡 Bewegung langsam ausführen, Standbein leicht beugen für mehr Stabilität."
  },
  "declinesitup": {
    "steps": [
      "1. Setup: Ab & Back Trainer – Rückenteil in eine schräge Position einstellen, Fußstütze hochklappen.",
      "2. Ausführung: Auf den Ab & Back Trainer setzen, Füße unter der Fußstütze positionieren und Oberkörper absenken. Für jede Wiederholung mindestens die Schulter von der Bank heben.",
      "Fokus auf den Bauch, nicht auf die Hüfte – nicht mit den Händen am Kopf ziehen."
    ],
    "note": "💡 Je steiler die Neigung, desto anspruchsvoller die Übung."
  },
  "weightedsitup": {
    "steps": [
      "1. Setup: Fußstütze am Ab & Back Trainer oben einstellen, Kurzhantel mit beiden Händen vor der Brust halten.",
      "2. Ausführung: Wie beim normalen Sit-up nach oben kommen, das Gewicht bleibt dabei nah am Körper, kontrolliert absenken."
    ],
    "note": null
  },
  "hanginglegraise": {
    "steps": [
      "1. Setup: An der Klimmzugstange des Rack einhängen, Arme gestreckt.",
      "2. Ausführung: Beine gestreckt oder angewinkelt bis zur Hüfte heben, Bauch anspannen, kontrolliert absenken."
    ],
    "note": null
  },
  "cablecrunch": {
    "steps": [
      "1. Setup: Seilgriff am oberen Kabelzug einhängen, kniend direkt vor dem Rack positionieren.",
      "2. Ausführung: Mit dem Bauch einrollen und das Seil nach unten Richtung Knie ziehen, Nacken dabei neutral lassen."
    ],
    "note": null
  },
  "pallof": {
    "steps": [
      "1. Setup: D-Griff am unteren Kabelzug einhängen, seitlich zum Rack stellen.",
      "2. Ausführung: Griff auf Brusthöhe halten und Arme nach vorne strecken, Rumpf stabil halten, keine Rotation zulassen, dann zurückführen."
    ],
    "note": null
  },
  "hyperext": {
    "steps": [
      "1. Setup: Fußstütze am Ab & Back Trainer unten einstellen, Hüfte auf dem Polster positionieren.",
      "2. Ausführung: Oberkörper langsam bis zur Linie mit den Beinen anheben und kontrolliert absenken, Fokus auf den unteren Rücken."
    ],
    "note": null
  },
  "latpulldown": {
    "steps": [
      "1. Setup: Hantelbank längs ins Rack stellen (Fußteil zum Kabelzug), Ergogriff oder Stange oben einhängen, hinsetzen.",
      "2. Ausführung: Griff zur oberen Brust ziehen, Ellbogen Richtung Hüfte, Brust herausstrecken, langsam wieder strecken."
    ],
    "note": null
  },
  "cablerow": {
    "steps": [
      "1. Setup: D-Griff oder Stange unten einhängen, sitzen oder auf dem Boden, Füße fixiert.",
      "2. Ausführung: Griff zum Bauch ziehen, Schulterblätter zusammen, Rücken neutral, langsam strecken."
    ],
    "note": null
  },
  "khrudern": {
    "steps": [
      "1. Setup: Ein Knie und eine Hand auf der Hantelbank abstützen, andere Hand hält die Kurzhantel, Rücken parallel zum Boden.",
      "2. Ausführung: Hantel nah am Körper nach oben ziehen, Ellbogen zur Hüfte, Schulterblatt zusammenziehen, kontrolliert absenken."
    ],
    "note": null
  },
  "pullup": {
    "steps": [
      "1. Setup: An der Klimmzugstange des Rack einhängen, Griff nach Wahl (Ober- oder Untergriff, breit/eng/neutral).",
      "2. Ausführung: Brust zur Stange ziehen, Schulterblätter zusammen, kontrolliert ablassen."
    ],
    "note": null
  },
  "bbrow": {
    "steps": [
      "1. Setup: Langhantel mit Scheiben, Füße hüftbreit, Knie leicht gebeugt, Oberkörper 45° vorgebeugt.",
      "2. Ausführung: Stange zum unteren Bauch ziehen, Rücken flach halten, Schulterblätter zusammenziehen, kontrolliert absenken."
    ],
    "note": null
  },
  "deadlift": {
    "steps": [
      "1. Setup: Stange am Boden, Füße hüftbreit, Griff gemischt oder doppelt, Rücken neutral.",
      "2. Ausführung: Hüfte und Knie gleichzeitig strecken, Stange dicht am Körper halten, aufrecht enden."
    ],
    "note": null
  },
  "khcurl": {
    "steps": [
      "1. Setup: Kurzhanteln passend einstellen, aufrecht stehen, Arme locker hängen.",
      "2. Ausführung: Hanteln zur Schulter hochcurlen, Ellbogen bleiben fixiert am Körper, kontrolliert absenken."
    ],
    "note": null
  },
  "dgriffcurl": {
    "steps": [
      "1. Setup: D-Griff am unteren Kabelzug einhängen, aufrecht stehend davor positionieren.",
      "2. Ausführung: Griff zur Schulter curlen, Ellbogen fixiert, kontrolliert absenken."
    ],
    "note": null
  },
  "pushdown": {
    "steps": [
      "1. Setup: Kurze Stange am oberen Kabelzug einhängen, aufrecht stehend, Ellbogen am Körper fixiert.",
      "2. Ausführung: Stange nach unten drücken bis Arme fast gestreckt sind, kontrolliert wieder hochführen."
    ],
    "note": null
  },
  "schulterdruecken": {
    "steps": [
      "1. Setup: Hantelbank aufrecht/senkrecht einstellen, Kurzhanteln auf Schulterhöhe halten. Bei belegter Bank alternativ auf dem Ab & Back Trainer sitzen.",
      "2. Ausführung: Hanteln über den Kopf drücken, oben kurz halten, kontrolliert wieder zur Schulter absenken."
    ],
    "note": null
  },
  "facepull": {
    "steps": [
      "1. Setup: Seilgriff am oberen Kabelzug einhängen, ein Schritt zurücktreten.",
      "2. Ausführung: Seil Richtung Gesicht ziehen, Ellbogen hoch und nach außen, Schulterblätter zusammenziehen."
    ],
    "note": null
  },
  "ohp": {
    "steps": [
      "1. Setup: Langhantel in J-Hooks auf Schulterhöhe, Griff schulterbreit, Stange aus den Hooks heben.",
      "2. Ausführung: Stange über den Kopf drücken bis Arme gestreckt, kontrolliert zurück zur Schulter senken."
    ],
    "note": null
  },
  "khbankdruecken": {
    "steps": [
      "1. Setup: Hantelbank flach oder leicht schräg im Rack, Hanteln auf Brusthöhe.",
      "2. Ausführung: Hanteln nach oben drücken, Schulterblätter zusammen, langsam senken."
    ],
    "note": null
  },
  "khflyes": {
    "steps": [
      "1. Setup: Bank flach, Hanteln über der Brust, Arme leicht gebeugt.",
      "2. Ausführung: In weitem Bogen nach außen senken bis leichte Dehnung, dann zusammenführen."
    ],
    "note": null
  },
  "cablechestpress": {
    "steps": [
      "1. Setup: D-Griffe am Kabel unten einhängen, kniend oder tief stehend vor dem Rack.",
      "2. Ausführung: Schräg nach vorn/oben drücken, Brust anspannen, langsam zurückführen."
    ],
    "note": null
  },
  "benchpress": {
    "steps": [
      "1. Setup: Hantelbank im Rack, Stange in J-Hooks auf Brusthöhe, Füße fest am Boden.",
      "2. Ausführung: Stange zur unteren Brust senken, Schulterblätter zusammen, dann kraftvoll nach oben drücken."
    ],
    "note": "⚠️ Safety Arms passend zur Brusthöhe einstellen."
  },
  "inclinebench": {
    "steps": [
      "1. Setup: Bank geneigt, Hanteln auf Schulterhöhe.",
      "2. Ausführung: Hanteln nach oben drücken, oben zusammenführen, langsam senken."
    ],
    "note": null
  },
  "pullover": {
    "steps": [
      "1. Setup: Bank quer, nur Schultern auf der Bank, Hantel mit beiden Händen über der Brust halten, Arme leicht gebeugt.",
      "2. Ausführung: Hantel hinter den Kopf senken bis leichte Dehnung in Brust und Lat, dann zurückführen."
    ],
    "note": null
  },
  "jammerarme": {
    "steps": [
      "1. Setup: Bumper Plate mit beiden Händen vor der Brust oder über dem Kopf greifen, aufrecht stehen, Rumpf angespannt.",
      "2. Ausführung: Platte kontrolliert über den Kopf drücken oder seitlich/frontal heben, ohne den Rücken zu überstrecken, dann langsam zurückführen."
    ],
    "note": null
  },
  "jammerbrust": {
    "steps": [
      "1. Setup: Jammer Arme auf niedrige Höhe einstellen, Griffe fassen, auf der Hantelbank flach liegen, Arme angewinkelt vor der Brust.",
      "2. Ausführung: Jammer Arme nach oben/vorne drücken bis Arme fast gestreckt sind, kontrolliert wieder zur Brust absenken."
    ],
    "note": "💡 Trage in der Notiz ein, auf welcher Stufe du die Jammer Arme eingestellt hast."
  },
  "jammerschulter": {
    "steps": [
      "1. Setup: Jammer Arme auf hohe Höhe (etwa Schulterhöhe) einstellen, Griffe auf Schulterhöhe fassen, aufrecht stehen oder sitzen.",
      "2. Ausführung: Jammer Arme über den Kopf drücken bis Arme fast gestreckt sind, kontrolliert wieder zur Schulter absenken."
    ],
    "note": "💡 Trage in der Notiz ein, auf welcher Stufe du die Jammer Arme eingestellt hast."
  },
  "jammerinclinebrust": {
    "steps": [
      "1. Setup: Jammer Arme auf mittlere Höhe einstellen, Schrägbank mit 30° oder 45° Rückenlehne darunter stellen, Griffe fassen.",
      "2. Ausführung: Jammer Arme schräg nach oben drücken bis Arme fast gestreckt sind, kontrolliert wieder zur Brust absenken."
    ],
    "note": "💡 Trage in der Notiz ein, auf welcher Stufe die Jammer Arme standen und ob die Bank auf 30° oder 45° stand."
  }
};

export const EXERCISES = [
  { id:"squat", name:"Bodyweight Squat", body:"beine", equip:["koerper"], level:"easy", defMin:12, defMax:20 },
  { id:"backsquat", name:"Barbell Back Squat", body:"beine", equip:["langhantel","rack"], level:"advanced", defMin:6, defMax:10, rackSetting:true, rackLabel:"J-Hooks & Safety Arms Stufe" },
  { id:"rdl", name:"Romanian Deadlift", body:"beine", equip:["langhantel"], level:"advanced", defMin:8, defMax:12 },
  { id:"nordic", name:"Nordic Curls", body:"beine", equip:["rack"], level:"advanced", defMin:4, defMax:8 },
  { id:"kickback", name:"Kabel-Kickback", body:"beine", equip:["kabel"], level:"mid", defMin:12, defMax:15 },
  { id:"legextensioncable", name:"Leg Extension sitzend (Kabelzug)", body:"beine", equip:["kabel"], level:"mid", defMin:10, defMax:15 },
  { id:"legcurlcable", name:"Leg Curl stehend (Kabelzug)", body:"beine", equip:["kabel"], level:"mid", defMin:10, defMax:15 },
  { id:"declinesitup", name:"Decline Sit-ups", body:"bauch", equip:["abback"], level:"easy", defMin:12, defMax:20 },
  { id:"weightedsitup", name:"Weighted Sit-up", body:"bauch", equip:["abback","kurzhantel"], level:"easy", defMin:10, defMax:15 },
  { id:"hanginglegraise", name:"Hanging Leg Raise", body:"bauch", equip:["rack"], level:"mid", defMin:8, defMax:15 },
  { id:"cablecrunch", name:"Cable Crunch (kniend)", body:"bauch", equip:["kabel"], level:"mid", defMin:12, defMax:20 },
  { id:"pallof", name:"Pallof Press", body:"bauch", equip:["kabel"], level:"mid", defMin:10, defMax:15 },
  { id:"hyperext", name:"Hyperextensions", body:"ruecken", equip:["abback"], level:"easy", defMin:10, defMax:15 },
  { id:"latpulldown", name:"Lat Pulldown", body:"ruecken", equip:["kabel"], level:"easy", defMin:8, defMax:12 },
  { id:"cablerow", name:"Cable Row (sitzend)", body:"ruecken", equip:["kabel"], level:"easy", defMin:8, defMax:12 },
  { id:"khrudern", name:"Kurzhantel-Rudern", body:"ruecken", equip:["kurzhantel"], level:"easy", defMin:8, defMax:12 },
  { id:"pullup", name:"Pull-Up / Chin-Up", body:"ruecken", equip:["rack"], level:"advanced", defMin:4, defMax:10 },
  { id:"bbrow", name:"Barbell Bent Over Row", body:"ruecken", equip:["langhantel"], level:"advanced", defMin:6, defMax:10 },
  { id:"deadlift", name:"Deadlift", body:"ruecken", equip:["langhantel"], level:"advanced", defMin:5, defMax:8 },
  { id:"khcurl", name:"Kurzhantel-Bizeps-Curl", body:"arme", equip:["kurzhantel"], level:"easy", defMin:10, defMax:15 },
  { id:"dgriffcurl", name:"D-Griff Bizeps-Curl", body:"arme", equip:["kabel"], level:"mid", defMin:10, defMax:15 },
  { id:"pushdown", name:"Trizeps-Pushdown", body:"arme", equip:["kabel"], level:"mid", defMin:10, defMax:15 },
  { id:"schulterdruecken", name:"Kurzhantel-Schulterdrücken", body:"arme", equip:["kurzhantel"], level:"easy", defMin:8, defMax:12 },
  { id:"facepull", name:"Face Pull", body:"arme", equip:["kabel"], level:"mid", defMin:12, defMax:15 },
  { id:"ohp", name:"Barbell Overhead Press", body:"arme", equip:["langhantel"], level:"advanced", defMin:6, defMax:10, rackSetting:true, rackLabel:"J-Hooks Stufe" },
  { id:"jammerarme", name:"Jammer Arme", body:"arme", equip:["jammer"], level:"mid", defMin:10, defMax:15, rackSetting:true, rackLabel:"Jammer Arme Höhe" },
  { id:"jammerbrust", name:"Brustpresse (Jammer Arme)", body:"brust", equip:["jammer"], level:"mid", defMin:8, defMax:12, rackSetting:true, rackLabel:"Jammer Arme Höhe (niedrig)" },
  { id:"jammerschulter", name:"Schulterdrücken (Jammer Arme)", body:"arme", equip:["jammer"], level:"mid", defMin:8, defMax:12, rackSetting:true, rackLabel:"Jammer Arme Höhe (hoch/Schulterhöhe)" },
  { id:"jammerinclinebrust", name:"Incline Brustpresse (Jammer Arme)", body:"brust", equip:["jammer"], level:"mid", defMin:8, defMax:12, rackSetting:true, rackLabel:"Jammer Arme Höhe (mittel)" },
  { id:"khbankdruecken", name:"Kurzhantel-Bankdrücken", body:"brust", equip:["kurzhantel"], level:"easy", defMin:8, defMax:12 },
  { id:"khflyes", name:"Kurzhantel-Flyes", body:"brust", equip:["kurzhantel"], level:"easy", defMin:10, defMax:15 },
  { id:"cablechestpress", name:"Cable Chest Press", body:"brust", equip:["kabel"], level:"mid", defMin:10, defMax:15 },
  { id:"benchpress", name:"Barbell Bench Press", body:"brust", equip:["langhantel"], level:"advanced", defMin:5, defMax:8, rackSetting:true, rackLabel:"J-Hooks & Safety Arms Stufe" },
  { id:"inclinebench", name:"Incline Bench Press (KH)", body:"brust", equip:["kurzhantel"], level:"easy", defMin:8, defMax:12 },
  { id:"pullover", name:"Dumbbell Pullover", body:"brust", equip:["kurzhantel"], level:"easy", defMin:10, defMax:15 },
];

export const BODY_LABELS = { beine:"Beine & Po", bauch:"Bauch & Core", ruecken:"Rücken & Lat", arme:"Arme & Schultern", brust:"Brust" };
export const LEVEL_LABELS = { easy:"Einfach", mid:"Mittel", advanced:"Fortgeschritten" };
export const LEVEL_ORDER = ["easy","mid","advanced"];
export const LEVEL_DESC = {
  easy:"Ab & Back Trainer, Kabelzug (Latziehen &amp; Rudern), Kurzhanteln",
  mid:"+ alle Kabelzug-Übungen, Jammer Arme, hängende Übungen an der Klimmzugstange",
  advanced:"+ Langhantel &amp; freies Rack (Kniebeuge, Kreuzheben, Pull-Up)"
};
