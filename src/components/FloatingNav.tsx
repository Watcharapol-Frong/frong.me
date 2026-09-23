import { useState, useEffect } from "react";
import { Mail, Linkedin, Github, Cookie } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ANALYTICS_SETTINGS_EVENT } from "@/lib/analytics-consent";

const FloatingNav = () => {
  const [currentPath, setCurrentPath] = useState("/");
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => {
    setCurrentPath(window.location.pathname);
  }, []);

  const navItems = [
    { name: "Work", path: "/" },
    { name: "About", path: "/about" },
  ];

  const isActive = (path: string) => {
    if (path === "/") return currentPath === "/" || currentPath === "/index" || currentPath === "/explore";
    return currentPath.startsWith(path);
  };

  const socialLinks = [
    { name: "LinkedIn", icon: Linkedin, url: "https://www.linkedin.com/in/watcharapol-charoensuk-336b4a342" },
    { name: "GitHub", icon: Github, url: "https://github.com/Watcharapol-Frong" },
  ];

  const openAnalyticsSettings = () => {
    setContactOpen(false);
    window.setTimeout(() => {
      const event = new Event(ANALYTICS_SETTINGS_EVENT, { cancelable: true });
      const handled = !window.dispatchEvent(event);
      if (!handled) window.location.assign("/privacy/");
    }, 0);
  };

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-1 bg-muted/80 backdrop-blur-md rounded-full p-1.5">
        {navItems.map((item) => (
          <a
            key={item.name}
            href={item.path}
            className={`px-5 py-2 text-sm font-medium rounded-full transition-all duration-300 ${
              isActive(item.path)
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.name}
          </a>
        ))}

        {/* Contact with Popover */}
        <Popover open={contactOpen} onOpenChange={setContactOpen}>
          <PopoverTrigger asChild>
            <button
              data-analytics-settings-return
              className={`px-5 py-2 text-sm font-medium rounded-full transition-all duration-300 ${
                contactOpen
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Contact
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 p-4 rounded-2xl border border-border bg-background/95 backdrop-blur-md shadow-xl"
            side="top"
            sideOffset={12}
          >
            <div className="space-y-4">
              {/* Say Hi Section */}
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                  Say Hi!
                </p>
                <a
                  href="mailto:frongbook@hotmail.com"
                  className="flex items-center gap-2 text-sm hover:opacity-70 transition-opacity"
                >
                  <Mail size={14} />
                  frongbook@hotmail.com
                </a>
              </div>

              {/* Follow Me Section */}
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                  Follow me
                </p>
                <div className="flex gap-2">
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

              <div className="pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={openAnalyticsSettings}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Cookie size={14} aria-hidden="true" />
                  <span>Privacy &amp; Analytics</span>
                </button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </nav>
  );
};

export default FloatingNav;
