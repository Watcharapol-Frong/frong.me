import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import FloatingNav from "@/components/FloatingNav";
import ScrollRevealText from "@/components/ScrollRevealText";
import { Mail, MapPin, Linkedin, Github, X, ChevronRight } from "lucide-react";

const allCertifications = [
  { name: "Effective Storytelling with AI", org: "Skooldio", year: "2026", url: "https://www.skooldio.com/certificate/8b692689-19d1-4bc6-b63c-daa0c01c5c39" },
  { name: "Design Dashboard Principles", org: "Skooldio", year: "2026", url: "https://www.skooldio.com/certificate/244c1689-f6a2-42b4-9adf-bbbd8b29e252" },
  { name: "Service Design Essentials", org: "", year: "2025", url: "https://www.skooldio.com/certificate/a9d37fe4-dde6-4f29-8d77-ca9cc5b9ec2c" },
  { name: "Design Thinking for Innovation", org: "", year: "2025", url: "https://www.skooldio.com/certificate/5add5fa5-014a-4e87-8613-d1e265bc769f" },
  { name: "Data Analysis with Excel", org: "", year: "2025", url: "https://www.skooldio.com/certificate/bafc67a1-eb68-4e68-aa12-eece7dbc759c" },
  { name: "Data Storytelling with Infographic", org: "", year: "2025", url: "https://www.skooldio.com/certificate/397fa356-8e99-4444-8ad4-54c9e5b2d9b3" },
  { name: "AI Development Scholarship", org: "42Bangkok & PMU-B", year: "2025" },
  { name: "Excel Certification", org: "W3Schools", year: "2025", url: "https://verify.w3schools.com/1PN7SXB58K" },
  { name: "SQL Certification", org: "W3Schools", year: "2025", url: "https://verify.w3schools.com/1PNZLL04OO" },
  { name: "R Certification", org: "W3Schools", year: "2025", url: "https://verify.w3schools.com/1POFEDHI63" },
  { name: "Statistics Certification", org: "W3Schools", year: "2025", url: "https://verify.w3schools.com/66MY2KHXK" },
  { name: "Python Certification", org: "W3Schools", year: "2025", url: "https://verify.w3schools.com/1PV5G3VOWV" },
  { name: "AWS Cloud Certification", org: "W3Schools", year: "2025", url: "https://verify.w3schools.com/1PVB7QYU8O" },
  { name: "Git Certification", org: "W3Schools", year: "2025", url: "https://verify.w3schools.com/1PVTMRJIPS" },
  { name: "Data Pipelines with Airflow", org: "", year: "2024", url: "https://www.skooldio.com/certificate/277aeb0b-ac51-42b8-b973-e7b15460a679" },
  { name: "Effective Data Storytelling", org: "", year: "2024", url: "https://www.skooldio.com/certificate/8292773d-2560-4657-b2f0-91e2cef45dd9" },
  { name: "Usability Design & Psychology for Digital Products", org: "", year: "2024", url: "https://www.skooldio.com/certificate/9b0b8f94-b464-4799-94f4-c33402b2cfe6" },
  { name: "Enhancing UX Design Process with AI and ChatGPT", org: "", year: "2024", url: "https://www.skooldio.com/certificate/617787c3-3d35-49ed-849e-5235c93ad054" },
  { name: "Intro to User Experience Design", org: "Skooldio", year: "2024", url: "https://www.skooldio.com/certificate/6a621c43-4e00-46b9-896d-e218b6cda42f" },
  { name: "Fundamental Web Dev with HTML5 & CSS3", org: "", year: "2023", url: "https://school.borntodev.com/certificate/61mVXydlI3FL" },
  { name: "Essential SQL for Everyone", org: "", year: "2023", url: "https://school.borntodev.com/certificate/RhRQPOnwKuEC" },
  { name: "Notion Database for Everyone", org: "", year: "2023", url: "https://school.borntodev.com/certificate/0kbg3JX8VkjX" },
  { name: "Excel for Everyone", org: "", year: "2023", url: "https://school.borntodev.com/certificate/fdplhuhjTmBA" },
  { name: "Data Science Bootcamp", org: "DataRockie", year: "2022" },
];

// Group by year descending
const certsByYear = allCertifications.reduce<Record<string, typeof allCertifications>>(
  (acc, cert) => {
    if (!acc[cert.year]) acc[cert.year] = [];
    acc[cert.year].push(cert);
    return acc;
  },
  {}
);
const sortedYears = Object.keys(certsByYear).sort((a, b) => Number(b) - Number(a));

const AboutIsland = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (window.location.hash === "#contact") {
      const element = document.getElementById("contact");
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const experience = [
    { company: "CP Axtra (Makro Pro)", period: "2025 – Present" },
    { company: "Com7 Public Company Limited", period: "2023 – 2025" },
    { company: "ACTIVE NATION CO., LTD", period: "2021 – 2023" },
    { company: "INDEX LIVING MALL", period: "2019 – 2021" },
  ];

  const skills = [
    "Excel",
    "Python",
    "R",
    "SQL",
    "Cloud",
    "Statistics",
    "Classical ML",
    "AI",
    "Data Visualization",
    "UXUI Design",
  ];

  // Preview: show top 4 certs in the grid
  const previewCerts = allCertifications.slice(0, 4);

  const bootcampCommunity = [
    {
      title: "Data Science Bootcamp",
      org: "DataRockie",
      description: "Completed hands-on projects in Python, SQL, R, and Data visualization",
      note: "30K+ students as of Aug 2022",
    },
    {
      title: "AI Development Scholarship Program",
      org: "42Bangkok & PMU-B",
      description: "Currently enrolled in an intensive 4 month scholarship program. Developing hands-on projects in AI, Algorithms, and Data Structures using Python",
      note: "Oct 2025 – Jan 2026",
    },
  ];

  const education = [
    {
      en: "Bachelor of Economics, Ramkhamhaeng University",
      th: "ปริญญาตรีเศรษฐศาสตร์ มหาวิทยาลัยรามคำแหง",
    },
    {
      en: "Bachelor of Laws, Ramkhamhaeng University (In Progress)",
      th: "ปริญญาตรีนิติศาสตรบัณฑิต มหาวิทยาลัยรามคำแหง (กำลังศึกษา)",
    },
  ];

  const socialLinks = [
    { name: "LinkedIn", icon: Linkedin, url: "https://www.linkedin.com/in/watcharapol-charoensuk-336b4a342" },
    { name: "GitHub", icon: Github, url: "https://github.com/Watcharapol-Frong" },
  ];

  return (
    <>
      <main className="min-h-screen bg-background page-transition">
        <Navbar />

        {/* Hero Bio Section */}
        <section className="px-6 pt-24 pb-4">
          <div className="max-w-[95%]">
            <ScrollRevealText
              text="Hello and welcome!"
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl leading-[1.1] font-display"
            />
          </div>
        </section>

        {/* Intro copy */}
        <section className="px-6 pb-16 fade-in-up">
          <div className="max-w-2xl space-y-4">
            <p className="text-base md:text-lg text-foreground/80 leading-relaxed">
              ขอบคุณที่แวะเข้ามาเยี่ยมชมเว็บไซต์ของผมนะครับ
            </p>
            <p className="text-base md:text-lg text-foreground/80 leading-relaxed">
              ที่นี่เป็นพื้นที่เล็ก ๆ ที่ผมใช้เก็บและแบ่งปันเรื่องราวต่าง ๆ ที่ได้เจอ ได้ลองทำ หรือได้เรียนรู้ระหว่างทาง
              ทั้งโปรเจกต์ แนวคิด และเรื่องที่ผมสนใจในช่วงนั้น ๆ หวังว่าบางเรื่องจะเป็นประโยชน์
              หรือจุดประกายไอเดียใหม่ ๆ ให้คุณได้ครับ
            </p>

            <div className="pt-6 mt-2 border-t border-border">
              <p className="text-sm font-medium">I am Frong! (ฟรองซ์)</p>
              <p className="text-sm text-muted-foreground">Watcharapol Charoensuk วัชรพล เจริญสุข</p>
              <p className="text-sm text-muted-foreground">1998s Kid 👶</p>
            </div>
          </div>
        </section>

        {/* Bottom Info Section - Horizontal Layout */}
        <section className="px-6 pb-32" id="contact">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12 fade-in-up">
            {/* Skills */}
            <div>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4 border-b border-border pb-2">
                Skills
              </h3>
              <p className="text-sm text-foreground leading-relaxed">
                {skills.join(" · ")}
              </p>
            </div>

            {/* Work Experience */}
            <div>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4 border-b border-border pb-2">
                Work Experience
              </h3>
              <ul className="space-y-1">
                {experience.map((item) => (
                  <li key={item.company} className="text-sm">
                    <span className="block">{item.company}</span>
                    <span className="text-muted-foreground text-xs">{item.period}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Bootcamp & Community */}
            <div>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4 border-b border-border pb-2">
                Programs & Activities
              </h3>
              <ul className="space-y-5">
                {bootcampCommunity.map((item) => (
                  <li key={item.title} className="text-sm">
                    <span className="block font-medium">{item.title} - {item.org}</span>
                    <span className="block text-muted-foreground mt-0.5">{item.description}</span>
                    <span className="block text-muted-foreground text-xs mt-1">{item.note}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Education */}
            <div>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4 border-b border-border pb-2">
                Education
              </h3>
              <ul className="space-y-5">
                {education.map((item) => (
                  <li key={item.en} className="text-sm">
                    <span className="block font-medium">{item.en}</span>
                    <span className="block text-muted-foreground mt-0.5">{item.th}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Certifications — clickable header opens drawer */}
            <div>
              <button
                onClick={() => setDrawerOpen(true)}
                className="w-full text-left group"
                aria-label="View all certifications"
              >
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4 border-b border-border pb-2 flex items-center justify-between group-hover:text-foreground transition-colors duration-200">
                  Certifications
                  <ChevronRight size={12} className="opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
                </h3>
              </button>
              <ul className="space-y-1">
                {previewCerts.map((item) => (
                  <li key={item.name} className="text-sm flex justify-between gap-4">
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate hover:text-foreground hover:underline transition-colors"
                      >
                        {item.name}
                      </a>
                    ) : (
                      <span className="truncate">{item.name}</span>
                    )}
                    <span className="text-muted-foreground flex-shrink-0">{item.year}</span>
                  </li>
                ))}
                <li>
                  <button
                    onClick={() => setDrawerOpen(true)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 mt-1"
                  >
                    +{allCertifications.length - previewCerts.length} more →
                  </button>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4 border-b border-border pb-2">
                Say Hi!
              </h3>
              <div className="space-y-2">
                <a
                  href="mailto:frongbook@hotmail.com"
                  className="text-sm hover:opacity-70 transition-opacity flex items-center gap-2"
                >
                  <Mail size={14} />
                  frongbook@hotmail.com
                </a>
                <p className="text-sm flex items-center gap-2 text-muted-foreground">
                  <MapPin size={14} />
                  Bangkok, Thailand
                </p>
                <div className="flex gap-2 pt-3">
                  {socialLinks.map((social) => (
                    <a
                      key={social.name}
                      href={social.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 border border-border rounded-full hover:bg-foreground hover:text-background transition-all duration-300"
                      aria-label={social.name}
                    >
                      <social.icon size={14} />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Certifications Drawer */}
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-background border-l border-border shadow-2xl flex flex-col transition-transform duration-400 ease-in-out ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Certifications drawer"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">All</p>
            <h2 className="text-lg font-medium">Certifications</h2>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-2 rounded-full hover:bg-muted transition-colors duration-200"
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {sortedYears.map((year) => (
            <div key={year}>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3 font-medium">
                {year}
              </p>
              <ul className="space-y-3">
                {certsByYear[year].map((cert) => (
                  <li key={cert.name} className="flex flex-col gap-0.5">
                    {cert.url ? (
                      <a
                        href={cert.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm hover:text-foreground hover:underline transition-colors"
                      >
                        {cert.name}
                      </a>
                    ) : (
                      <span className="text-sm">{cert.name}</span>
                    )}
                    {cert.org && (
                      <span className="text-xs text-muted-foreground">{cert.org}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Drawer Footer */}
        <div className="px-6 py-4 border-t border-border flex-shrink-0">
          <p className="text-xs text-muted-foreground">{allCertifications.length} certifications total</p>
        </div>
      </aside>

      <FloatingNav />
    </>
  );
};

export default AboutIsland;
