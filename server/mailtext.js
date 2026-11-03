// Texto de los correos de respuesta; lo comparten el servidor Node y el Worker de Cloudflare.
export const buildDecisionMail = ({ kind, email, catalogNumber }, status, token, origin) => {
  const what = kind === 'descarga' ? 'descarga de datos' : `imagen del ejemplar ${catalogNumber}`;
  const sign = '\n\nHerbario SURCO\nUniversidad Surcolombiana\nherbario@usco.edu.co';
  let text;
  if (status === 'aprobada') {
    text = kind === 'imagen'
      ? `Hola,\n\nSu solicitud de ${what} fue aprobada. Puede verla con este enlace personal, válido por 7 días:\n\n${origin}/ejemplar/${encodeURIComponent(catalogNumber)}/?acceso=${token}\n\nPor favor no lo comparta.${sign}`
      : `Hola,\n\nSu solicitud de ${what} (${catalogNumber}) fue aprobada. El herbario le enviará los datos solicitados en un mensaje aparte.${sign}`;
  } else {
    text = `Hola,\n\nLamentamos informarle que su solicitud de ${what} no fue aprobada. Si desea más información, responda a este correo.${sign}`;
  }
  return { to: email, subject: `Herbario SURCO: respuesta a su solicitud de ${kind === 'descarga' ? 'descarga' : 'imagen'}`, text };
};
