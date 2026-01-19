# DEMAT-BT-BDSN - Dématérialisation des Bons de Travail

Interface web de gestion des bons de travail (BT) pour les managers et chefs d'équipe de GRDF - AI Boucle de Seine Nord.

## 🚀 Démo

Accéder à la démo : [https://votre-username.github.io/demat-bt-bdsn/](https://votre-username.github.io/demat-bt-bdsn/)

## 📋 Fonctionnalités

### Vue d'ensemble
- **Tableau de bord temps réel** avec statistiques (BT du jour, en attente, en cours, terminés)
- **Liste des techniciens** actifs avec leur statut
- **Filtres avancés** par type d'intervention et statut

### Types d'interventions supportés
- 🔴 **MHS** - Mise Hors Service
- 🟢 **MES** - Mise En Service
- 🔵 **Maintenance CI-CM** - Conduites d'immeuble / Colonnes montantes
- 🟠 **ADF** - Alerte De Fuite (surveillance, localisation)
- 🟣 **Formation** - Maintien de compétences
- ⚪ **Administratif** - Réunions, magasin

### Vues disponibles
1. **Vue Cartes** - Affichage en grille des BT avec informations clés
2. **Vue Planning** - Timeline par technicien avec visualisation horaire

### Détail d'un BT
- Informations générales (type, statut, horaire, adresse)
- Équipe assignée avec rôles
- Observations et consignes
- Actions (modifier, télécharger, envoyer au technicien)

## 🛠️ Installation locale

1. Cloner le repository :
```bash
git clone https://github.com/votre-username/demat-bt-bdsn.git
```

2. Ouvrir `index.html` dans un navigateur

Aucune dépendance externe n'est requise - le dashboard fonctionne entièrement côté client.

## 📦 Déploiement sur GitHub Pages

1. Créer un repository sur GitHub nommé `demat-bt-bdsn`
2. Pousser le code :
```bash
git init
git add .
git commit -m "Initial commit - DEMAT BT BDSN"
git branch -M main
git remote add origin https://github.com/votre-username/demat-bt-bdsn.git
git push -u origin main
```

3. Activer GitHub Pages :
   - Aller dans Settings > Pages
   - Source : Deploy from a branch
   - Branch : main / (root)
   - Save

Le site sera disponible à `https://votre-username.github.io/demat-bt-bdsn/`

## 🎨 Technologies utilisées

- **HTML5** / **CSS3** (variables CSS, Grid, Flexbox)
- **JavaScript** vanilla (ES6+)
- **Fonts** : Plus Jakarta Sans, JetBrains Mono (Google Fonts)

## 📱 Responsive

Le dashboard s'adapte aux différentes tailles d'écran :
- Desktop : Sidebar + Contenu principal
- Tablet : Contenu principal sans sidebar
- Mobile : Vue simplifiée en colonne

## 🔒 Données

Les données affichées sont des exemples basés sur des BT réels de l'AI Boucle de Seine Nord (19/01/2026). Dans une version de production, ces données seraient récupérées via une API.

## 📝 Prochaines étapes

- [ ] Interface mobile pour les techniciens
- [ ] Système de notifications push
- [ ] Intégration avec l'API de planification existante
- [ ] Export PDF des BT
- [ ] Mode hors-ligne (PWA)

## 👥 Équipe

Développé pour GRDF - AI Boucle de Seine Nord

---

*Ce projet est un prototype/maquette à des fins de démonstration.*
