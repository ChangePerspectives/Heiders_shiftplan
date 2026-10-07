# Heider’s installierbarer Dienstplan

## In GitHub veröffentlichen
1. ZIP entpacken.
2. Im Repository ChangePerspectives/Heiders_shiftplan „Add file → Upload files“ auswählen.
3. Alle Dateien aus diesem Ordner direkt ins Hauptverzeichnis hochladen. Die bisherige index.html ersetzen. Nicht den übergeordneten Ordner hochladen.
4. Änderungen mit „Commit changes“ speichern.
5. Falls GitHub Pages noch nicht eingerichtet ist: Settings → Pages → Deploy from a branch → main → /(root) → Save.
6. Die von GitHub unter Pages angezeigte Website öffnen. Die erwartete Standardadresse ist https://changeperspectives.github.io/Heiders_shiftplan/ .

## Auf dem iPhone installieren
Website in Safari öffnen → Teilen → Zum Home-Bildschirm → Hinzufügen.
Danach über das neue Heider’s-Symbol öffnen.

## Updates
Die App prüft nach dem Öffnen, beim Zurückkehren in die App, bei erneuter Internetverbindung und während der Nutzung ungefähr jede Minute auf einen neuen Service Worker. Eine neue Version wird mit „Jetzt aktualisieren“ angeboten. Offene Eingaben vorher speichern. Alle App-Dateien gemeinsam veröffentlichen; bei späteren Änderungen immer auch CACHE_VERSION in sw.js auf einen neuen eindeutigen Wert setzen. GitHub muss die Veröffentlichung zuerst abgeschlossen haben.
Bei einer fehlgeschlagenen Installation einer neuen Version bleibt die bisherige Version aktiv.

## Datenspeicherung und Offline-Nutzung
Diese Version speichert Dienstplandaten weiterhin lokal im Browser. Sie synchronisiert keine Schichten zwischen Geräten und enthält keine passwortgeschützte Anmeldung. Zentrale Datenbank und echte Anmeldung sind der nächste Ausbauschritt.
Nach erfolgreicher Zwischenspeicherung können App und lokale Daten auch ohne Internet geöffnet werden. Das Design verwendet weiterhin Tailwind vom CDN; der Service Worker versucht dieses ebenfalls zwischenzuspeichern. Falls dies beim ersten Besuch nicht gelingt, benötigt das vollständige Design Internet.
Auf derselben Website bleiben die bisherigen localStorage-Schlüssel erhalten. Daten von einer anderen Domain oder einem anderen Browser werden nicht übernommen; auch eine Home-Bildschirm-App kann auf iOS einen eigenen Speicherbereich verwenden.

## Enthaltene Änderungen
- „Karten“ heißt „Tagesplan“.
- Jede Zelle im Gesamtplan ist mit „Tag“ und „Abend“ beschriftet.
- Original-Logo unverändert eingebettet, ohne weißes Trägerfeld auf cremefarbenem Header.
- App-Manifest, App-Symbole, Service Worker und Update-Hinweis.
