// Prix du premier accompagnement. Une seule formule, utilisée par l'API, les CGV et les tests :
// 50 € à la remise du CV, puis 15 % du premier salaire brut mensuel de base, plafonné à 350 € au total.
export const MISE_EN_ROUTE_EUROS = 50;
export const TAUX = 0.15;
export const PLAFOND_EUROS = 350;

export type Prix = { total: number; dejaVerse: number; aLaSignature: number };

export function calculerPrix(salaireBrutMensuelEuros: number): Prix {
  if (!Number.isFinite(salaireBrutMensuelEuros) || salaireBrutMensuelEuros < 0) throw new RangeError('Salaire invalide');
  const total = Math.max(MISE_EN_ROUTE_EUROS, Math.min(Math.round(salaireBrutMensuelEuros * TAUX), PLAFOND_EUROS));
  return { total, dejaVerse: MISE_EN_ROUTE_EUROS, aLaSignature: total - MISE_EN_ROUTE_EUROS };
}
