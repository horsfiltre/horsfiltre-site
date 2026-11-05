// Comment la page comprend un refus 422 de l'API. Isolé du reste pour pouvoir être testé sans navigateur : un refus que la
// page ne connaît pas ne doit JAMAIS être présenté comme un échec du contrôle anti-robot. C'est ce qui est arrivé quand
// l'API a commencé à répondre `adresse_injoignable` : la page l'a annoncé comme une vérification ratée.
export function decrireRefus422(e) {
  if (e && e.erreurs && typeof e.erreurs === 'object') return { type: 'champs' };
  if (e && e.code === 'adresse_injoignable') return { type: 'adresse_injoignable' };
  if (e && e.code === 'turnstile_invalide') return { type: 'robot' };
  return { type: 'inconnu' };
}
