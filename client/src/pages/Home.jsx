import { Link } from "react-router-dom";
import { ArrowUpRight, Flower2, Sparkles, Heart } from "lucide-react";
import { VisitCTA } from "../components/Shared";
import ServiceCatalogue from "../catalogue/ServiceCatalogue";
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
            Henna artistry and beauty for Minnesota’s Somali community.
            A welcoming space for personal style, modest fashion, and the
            traditions you make your own.
          </p>
          <div className="actions">
            <Link className="button" to="/appointments">
              Book appointment <ArrowUpRight size={18} />
            </Link>
            <Link className="text-link" to="/queue">
              Join today’s queue <ArrowUpRight size={17} />
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
            src="/images/somali-beauty.svg"
            alt="Original illustration of a woman in a plum hijab with decorative henna on her hand"
            width="720"
            height="960"
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
          <span className="photo-note">Original illustration · not salon staff or work</span>
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
          Live services are shown directly from the salon’s catalogue.
        </p>
        <ServiceCatalogue limit={3} />
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
            Created with Minnesota’s Somali community in mind. Official salon
            photographs, team details, and our location will be shared once confirmed.
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
