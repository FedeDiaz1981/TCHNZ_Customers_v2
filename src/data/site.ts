export const brand = "TECHNIZED";

export const navLinks = [
  { label: "Home", href: "#header" },
  { label: "Nosotros", href: "#about" },
  { label: "Servicios", href: "#services" },
  { label: "Planes", href: "#plans" },
  { label: "Contacto", href: "#contact" }
];

export const socialLinks = [
  { label: "Facebook", href: "https://www.facebook.com/blatorh", icon: "fab fa-facebook-f" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/blatorh", icon: "fab fa-linkedin-in" },
  { label: "Instagram", href: "https://www.instagram.com/blatorh", icon: "fab fa-instagram" }
];

export const hero = {
  headline: "TECHNIZED",
  highlight: "Business Consulting",
  tagline: "Crecimiento a tu alcance",
  description: "Desarrollamos e implementamos soluciones a la medida de nuestros clientes.",
  cta: { label: "Ver Servicios", href: "#services" }
};

export const informationCards = [
  {
    title: "Profesionalismo",
    text:
      "Contamos con los mejores profesionales de amplia experiencia tanto en el ámbito de la Consultoría como también en Empresas Multinacionales y Nacionales.",
    icon: "fas fa-business-time",
    className: "bg-primary text-white"
  },
  {
    title: "Compromiso",
    text:
      "Nuestro compromiso es resolver los problemas de nuestros clientes y que los mismos se muestren satisfechos. Ofreciendo un servicio que exceda sus expectativas.",
    icon: "fas fa-handshake",
    className: "bg-primaryLight text-white"
  },
  {
    title: "Trabajo en Equipo",
    text:
      "Nuestros Equipos trabajan para alcanzar junto a nuestros Clientes sus metas y objetivos, y tornarlos alcanzables.",
    icon: "fas fa-superscript",
    className: "bg-white text-slate-900"
  }
];

export const about = {
  label: "Nosotros",
  title: "Un equipo de trabajo especializado.",
  text:
    "Grupo Technized es un equipo de profesionales con sólida experiencia y trayectoria en el mercado local y regional, adquirida en el ámbito de la consultoría y en compañías de primer nivel nacional e internacional. Presenta un variado y completo abanico de soluciones de negocios, producto de sus alianzas para brindar soluciones integrales de Business Consulting.",
  image: "/customers/assets/images/about.png",
  imageAlt: "about"
};

export const services = {
  label: "NUESTROS SERVICIOS",
  title: "Explora ilimitadas posibilidades",
  text:
    "Potenciamos empresas con un enfoque ágil y efectivo. Capacitamos y ayudamos al crear profesionales capaces de resolver problemas y mejorar la calidad tus negocios.",
  items: [
    {
      title: "Servicios y Estrategia",
      icon: "fas fa-briefcase",
      text:
        "Trabajamos para convertir ideas en acción; crear estrategias de innovación novedosas; optimizar las capacidades de las organizaciones; y ayudar a impulsar el crecimiento de nuestros clientes.",
      extraLine: "Leer más"
    },
    {
      title: "Consultoría de RRHH",
      icon: "fas fa-people-arrows",
      text:
        "Disponemos de un amplio y variado abanico de servicios de Recursos Humanos a través de consultores expertos de RRHH para ayudar a que los clientes puedan alcanzar y superar sus objetivos sin inconvenientes."
    },
    {
      title: "Servicios de Tecnología",
      icon: "fas fa-server",
      text:
        "Ayudamos a los clientes a que puedan apreciar un panorama de su negocio, con la tecnología como una parte importante, clave y, también, como un impulsor. Permitiéndoles obtener mejores y mayores resultados."
    },
    {
      title: "Consultoría de Payroll",
      icon: "fas fa-comment-dollar",
      text:
        "Ayudamos a nuestros clientes a resolver los problemas de la administración de personal y liquidación de sueldos. Contamos con consultores expertos en la materia que se encuentran actualizados en las normativas vigentes."
    },
    {
      title: "Servicios SAP",
      icon: "fas fa-globe",
      text:
        "• Proyectos de implementación • Proyectos de Migración • RE Ingeniería de Procesos • SAP Finance Modules • SAP Logistics Modules • SAP ARIBA • SAP REAL ESTATE • SAP BASIS & ABAP • SAP S/4 HANA • SAP HANA • SAP EHSM - Entre Otros"
    },
    {
      title: "Business Solutions",
      icon: "fas fa-tv",
      text:
        "• World Class Hcm Software (Latam y Europe) • Plataforma Educativa y Servicios • Asociados Legajo Digital, Firma Digital y Electrónica de Recibos de Sueldo y Documentos Access • Control Products y Software • CRM Suite - entre otros"
    }
  ]
};

export const contact = {
  label: "CONTACT",
  title: "Envianos tu consulta",
  form: {
    action: "https://formsubmit.co/info@blatorh.com",
    fields: {
      name: { label: "name", placeholder: "Enter name" },
      phone: { label: "phone", placeholder: "Enter phone number" },
      mail: { label: "mail", placeholder: "Enter email" },
      message: { label: "message", placeholder: "Message" }
    }
  },
  recaptchaKey: "6LeuSX8hAAAAAIZaVK4SVuVylDEYvo7EOcji0Ok6",
  image: "/customers/assets/images/contact.png",
  imageAlt: "contact"
};

export const locationItems = [
  {
    title: "Dirección",
    text: "Cucha Cucha 1180 – CABA . Buenos Aires . ARG",
    icon: "far fa-map"
  },
  {
    title: "Consultas",
    text: "(+54) 011 2071 5534",
    icon: "fas fa-mobile-alt"
  },
  {
    title: "Mensajes",
    text: "info@blatorh.com",
    icon: "far fa-envelope"
  },
  {
    title: "Horarios",
    text: "09:00 AM - 18:00 PM",
    icon: "far fa-clock"
  }
];

export const footer = {
  title: "Technized",
  text:
    "Nos especializamos en buscar, desarrollar e implementar soluciones a la medida de los Clientes. Contamos con un staff de trabajo comprometido y con un alto grado de profesionalismo. Mas de 100 profesionales especializados",
  quickLinks: [
    { label: "Nosotros", href: "#about" },
    { label: "Servicios", href: "#services" },
    { label: "Planes", href: "#plans" },
    { label: "Contacto", href: "#contact" }
  ],
  certificates: [
    { src: "/customers/assets/images/logosap.png", alt: "", width: 200 },
    { src: "/customers/assets/images/successfactorlogo.webp", alt: "", width: 200 }
  ]
};

export const bottomBar = {
  credit: "Desarrolado por",
  brand: "Creativity",
  link: "https://creativityestudio.com.ar/",
  linkLabel: "www.creativityestudio.com.ar"
};
