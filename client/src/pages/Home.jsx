import { Link } from "react-router-dom";
import { ArrowUpRight, Flower2, Sparkles, Heart } from "lucide-react";
import { services } from "../data/services";
import { ServiceCard, VisitCTA } from "../components/Shared";
export default function Home() {
  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="short-line" /> HENNA. BEAUTY. A LITTLE YOU-TIME.
          </p>
          <h1>
            Beauty in
            <br />
            every <em>detail.</em>
          </h1>
          <p className="hero-description">
            An artful touch. A moment of calm. Discover a salon concept where
            henna traditions meet everyday beauty.
          </p>
          <div className="actions">
            <Link className="button" to="/services">
              Explore our services <ArrowUpRight size={18} />
            </Link>
            <Link className="text-link" to="/about">
              Get to know us <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="hero-footnote">
            <Flower2 size={27} strokeWidth={1} />
            <span>
              Rooted in artistry.
              <br />
              <strong>Inspired by you.</strong>
            </span>
          </div>
        </div>
        <div className="hero-visual">
          <img
            className="hero-photo"
            src="https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85"
            alt="Beauty inspiration: natural portrait in warm sunlight"
            fetchPriority="high"
          />
          <div className="image-label">BEAUTY IN YOUR OWN WAY</div>
          <div className="hero-stamp">
            <Flower2 size={31} strokeWidth={1} />
            <span>
              A little ritual.
              <br />
              <em>A lovely feeling.</em>
            </span>
          </div>
          <span className="photo-note">Concept imagery · not salon work</span>
        </div>
      </section>
      <div className="values-strip">
        <span>
          <Flower2 /> Henna artistry
        </span>
        <i>✧</i>
        <span>
          <Sparkles /> Thoughtful beauty
        </span>
        <i>✧</i>
        <span>
          <Heart /> Time for yourself
        </span>
      </div>
      <section className="services-section container">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE BEAUTY MENU</p>
            <h2>
              A touch of artistry.
              <br />A world of <em>possibilities.</em>
            </h2>
          </div>
          <Link className="text-link" to="/services">
            Discover all services <ArrowUpRight size={18} />
          </Link>
        </div>
        <p className="section-note">
          A preview of our proposed services. Final offerings and pricing will
          be confirmed.
        </p>
        <div className="service-grid">
          {services.map((service) => (
            <ServiceCard key={service.number} service={service} />
          ))}
        </div>
      </section>
      <section className="story-section container">
        <div className="story-art" aria-hidden="true">
          <Flower2 strokeWidth={0.6} />
          <span>
            Made with care.
            <br />
            <em>Worn with confidence.</em>
          </span>
        </div>
        <div className="story-copy">
          <p className="eyebrow">MORE THAN A BEAUTY ROUTINE</p>
          <h2>
            A space to pause.
            <br />A reason to <em>glow.</em>
          </h2>
          <p>
            Our vision is simple: a welcoming space where the smallest details
            matter. Where beautiful henna, considered styling, and moments of
            care come together.
          </p>
          <p>
            This is the beginning of our salon story. We look forward to sharing
            the people and place behind it.
          </p>
          <Link className="text-link" to="/about">
            Read our story <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <VisitCTA />
    </>
  );
}
