// Se connecte comme administrateur (page de connexion Cognito, double authentification comprise), puis appelle une
// route d'administration de l'API. C'est le test de la chaîne réelle : Cognito, jeton, API Gateway, fonction.
//
//   $env:COGNITO_ADRESSE = terraform output -raw adresse_connexion
//   $env:COGNITO_CLIENT  = terraform output -raw id_client
//   $env:API_ADRESSE     = terraform output -raw adresse_api
//   node api\scripts\appeler-administration.mts GET /v1/admin/accompagnants
//
// Le jeton n'est jamais affiché. L'adresse de retour (http://localhost:8788/connexion) doit figurer parmi celles du client Cognito.
import { createServer } from 'node:http';
import { creerEtat, creerVerificateur, defiDepuis, lireRetour, lireRevendications, urlAutorisation } from '../src/pkce.mts';

const PORT = Number(process.env.PORT_RETOUR ?? 8788);
const URL_RETOUR = `http://localhost:${PORT}/connexion`;
const ATTENTE_MAX_MS = 5 * 60_000;

const adresseConnexion = process.env.COGNITO_ADRESSE;
const idClient = process.env.COGNITO_CLIENT;
const adresseApi = process.env.API_ADRESSE;
const [methode = 'GET', chemin = '/v1/admin/accompagnants', corps] = process.argv.slice(2);

if (!adresseConnexion || !idClient || !adresseApi) {
  console.error('Variables manquantes : COGNITO_ADRESSE, COGNITO_CLIENT et API_ADRESSE (voir l\'en-tête de ce fichier).');
  process.exit(1);
}
if (!chemin.startsWith('/v1/admin/')) {
  console.error("Ce script n'appelle que des routes d'administration (/v1/admin/…).");
  process.exit(1);
}

const verificateur = creerVerificateur();
const etat = creerEtat();

/** Attend que Cognito renvoie le navigateur vers cette machine, avec le code d'autorisation. */
function attendreCode(): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const serveur = createServer((req, res) => {
      if (!req.url?.startsWith('/connexion')) {
        res.writeHead(404).end();
        return;
      }
      const retour = lireRetour(req.url, etat);
      res.writeHead(retour.ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' });
      res.end(retour.ok ? '<p>Connexion réussie. Vous pouvez fermer cette page et revenir au terminal.</p>' : `<p>Connexion refusée (${retour.raison.replace(/[^a-z_]/g, '')}).</p>`);
      clearTimeout(minuteur);
      serveur.close();
      retour.ok ? resoudre(retour.code) : rejeter(new Error(`Connexion refusée : ${retour.raison}`));
    });
    const minuteur = setTimeout(() => { serveur.close(); rejeter(new Error('Délai dépassé : aucune connexion en 5 minutes.')); }, ATTENTE_MAX_MS);
    serveur.listen(PORT, '127.0.0.1', () => {
      const url = urlAutorisation({ adresseConnexion, idClient, urlRetour: URL_RETOUR, etat, defi: defiDepuis(verificateur) });
      console.log('Ouvrez cette adresse dans votre navigateur, puis connectez-vous (mot de passe et code de l\'application d\'authentification) :\n');
      console.log(url + '\n');
    });
    serveur.on('error', rejeter);
  });
}

async function principal(): Promise<void> {
  const code = await attendreCode();

  const reponseJeton = await fetch(`${adresseConnexion.replace(/\/+$/, '')}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: idClient, code, redirect_uri: URL_RETOUR, code_verifier: verificateur }),
  });
  const donneesJeton = (await reponseJeton.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!reponseJeton.ok || !donneesJeton.access_token) {
    console.error(`Échange du code refusé (${reponseJeton.status}) : ${donneesJeton.error ?? 'motif inconnu'}`);
    process.exit(1);
  }

  const rev = lireRevendications(donneesJeton.access_token);
  console.log(`Jeton obtenu (non affiché). Groupes : ${rev.groupes.join(', ') || 'aucun'}. Valable encore ${rev.expireDansMinutes ?? '?'} minute(s).\n`);

  const reponse = await fetch(`${adresseApi.replace(/\/+$/, '')}${chemin}`, {
    method: methode.toUpperCase(),
    headers: { authorization: `Bearer ${donneesJeton.access_token}`, ...(corps ? { 'content-type': 'application/json' } : {}) },
    ...(corps ? { body: corps } : {}),
  });
  const texte = await reponse.text();
  let affiche = texte;
  try { affiche = JSON.stringify(JSON.parse(texte), null, 2); } catch { /* pas du JSON : tel quel */ }
  console.log(`${methode.toUpperCase()} ${chemin} → ${reponse.status}`);
  console.log(affiche.length > 4000 ? `${affiche.slice(0, 4000)}\n… (tronqué)` : affiche);
  process.exit(reponse.ok ? 0 : 2);
}

principal().catch((erreur: unknown) => {
  console.error(`Échec : ${erreur instanceof Error ? erreur.message : 'erreur inconnue'}`);
  process.exit(1);
});
