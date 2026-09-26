import type { Email } from "./mail.service";

const SIGNATURE = "\n\n— L'équipe Xel-E\nXeeli ci xel";

export function emailConfirmation(destinataire: string, nomComplet: string, lien: string): Email {
  return {
    destinataire,
    sujet: "Confirme ton adresse email — Xel-E",
    texte:
      `Bonjour ${nomComplet},\n\n` +
      `Bienvenue sur Xel-E ! Pour confirmer ton adresse email, ouvre ce lien :\n${lien}\n\n` +
      `Ce lien est valable 48 heures. Si tu n'es pas à l'origine de cette inscription, ignore ce message.` +
      SIGNATURE,
  };
}

export function emailConsentementParental(
  destinataire: string,
  nomEleve: string,
  lien: string,
): Email {
  return {
    destinataire,
    sujet: "Votre accord pour l'inscription de votre enfant sur Xel-E",
    texte:
      `Bonjour,\n\n` +
      `${nomEleve} vient de s'inscrire sur Xel-E, la plateforme de soutien scolaire en Maths, ` +
      `Physique-Chimie et SVT pour les collégiens, et a indiqué votre adresse comme contact parent.\n\n` +
      `Comme votre enfant a moins de 15 ans, certaines fonctions (le forum d'entraide) restent fermées ` +
      `tant que vous n'avez pas donné votre accord. Les cours et exercices sont déjà accessibles.\n\n` +
      `Pour donner votre accord, ouvrez ce lien :\n${lien}\n\n` +
      `Ce lien est valable 7 jours. Si vous ne connaissez pas cet élève, ignorez ce message : ` +
      `le forum restera fermé pour ce compte.` +
      SIGNATURE,
  };
}

export function emailReinitialisation(
  destinataire: string,
  nomComplet: string,
  lien: string,
  envoyeAuParent: boolean,
): Email {
  const intro = envoyeAuParent
    ? `Bonjour,\n\nUne réinitialisation du mot de passe a été demandée pour le compte Xel-E de ${nomComplet}, ` +
      `dont vous êtes le contact parent.`
    : `Bonjour ${nomComplet},\n\nUne réinitialisation de ton mot de passe Xel-E a été demandée.`;
  return {
    destinataire,
    sujet: "Réinitialisation du mot de passe — Xel-E",
    texte:
      `${intro}\n\nPour choisir un nouveau mot de passe, ouvre ce lien :\n${lien}\n\n` +
      `Ce lien est valable 1 heure. Si personne n'a fait cette demande, ignore ce message : ` +
      `le mot de passe actuel reste inchangé.` +
      SIGNATURE,
  };
}

export function emailProfesseurValide(destinataire: string, nomComplet: string, lien: string): Email {
  return {
    destinataire,
    sujet: "Ton compte professeur est validé — Xel-E",
    texte:
      `Bonjour ${nomComplet},\n\nTon compte professeur a été validé par l'équipe Xel-E. ` +
      `Tu peux maintenant te connecter :\n${lien}` +
      SIGNATURE,
  };
}
