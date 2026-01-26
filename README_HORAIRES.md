# DEMAT-BT - Système d'extraction des horaires

## 📊 Extraction des données de la timeline

### Champs utilisés depuis zones.json

Le système extrait maintenant **3 champs clés** depuis chaque BT :

1. **DESIGNATION** : Contient les horaires de début/fin au format "XXhXX - XXhXX"
   - Exemple : "07h30 - 16h30"
   - Formats supportés : "7h30", "07:30", "07h30"

2. **DUREE** : Contient la durée prévue de l'intervention
   - Exemple : "8h00", "2h30", "1h15"
   - Utilisé en complément de DESIGNATION si l'heure de fin n'est pas présente

3. **OBJET** : Utilisé pour la classification automatique
   - Clientèle : MHS, MES, Mise en service, etc.
   - Maintenance : CI-CM, CICM, Maintenance préventive
   - Surveillance : ADF, Surveillance, Alerte, Fuite
   - Administratif : Réunion, Formation, Divers

### Logique d'extraction des horaires

#### Cas 1 : Horaire complet dans DESIGNATION
```
DESIGNATION = "07h30 - 16h30"
DUREE = "8h00"
→ Utilise 07h30 à 16h30
```

#### Cas 2 : Seulement heure de début + DUREE
```
DESIGNATION = "07h30"
DUREE = "8h00"
→ Calcule : 07h30 + 8h00 = 15h30
→ Utilise 07h30 à 15h30
```

#### Cas 3 : Seulement DUREE
```
DESIGNATION = ""
DUREE = "8h00"
→ Par défaut : 8h00 + 8h00 = 16h00
→ Utilise 8h00 à 16h00
```

#### Cas 4 : Aucune information
```
DESIGNATION = ""
DUREE = ""
→ Placement automatique sur 2 créneaux horaires
→ Répartition équitable sur la journée
```

## 🎨 Affichage dans la timeline

### Créneaux horaires
- Journée de travail : 8h - 18h
- Colonnes : 8h-9h, 9h-10h, ... 17h-18h (10 créneaux)

### Blocs BT
- Les blocs s'étendent sur plusieurs colonnes selon leur durée
- Couleur selon la catégorie d'intervention
- Affichage des horaires si le bloc fait 3 colonnes ou plus

### Placement automatique
Si pas d'horaires trouvés :
- Répartition équitable des BT sur la journée
- Évite de surcharger les créneaux du matin
- Chaque BT occupe au minimum 1 créneau

## 🔍 Debug

Ouvre la console du navigateur pour voir les logs :
```javascript
[ABIR Bilal] BT BT22626000801: {
  designation: "07h30 - 16h30",
  duree: "8h00",
  timeSlot: {start: 7.5, end: 16.5, text: "07h30 - 16h30"}
}
```

Ces logs apparaissent pour le premier BT de chaque technicien lors du rendu de la timeline.

## ✅ Vérifications

1. **zones.json** doit contenir les champs :
   - DUREE : bbox défini
   - DESIGNATION : bbox défini
   - OBJET : bbox défini

2. **PDF** doit avoir les informations dans les bonnes zones

3. **Console** affiche les logs d'extraction pour chaque technicien

## 🐛 Problèmes courants

### Les BT ne s'affichent pas aux bonnes heures
→ Vérifier dans la console les valeurs extraites de DESIGNATION et DUREE

### Tous les BT sont le matin
→ Vérifier que le champ DUREE est bien extrait (voir console)

### Les blocs sont trop petits
→ Les durées courtes (<1h) occupent 1 seul créneau minimum
