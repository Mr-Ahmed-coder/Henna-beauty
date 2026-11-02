import { Flower2, Heart, Sparkles } from "lucide-react";
import { PageHeading, VisitCTA } from "../components/Shared";
export default function About() {
  return (
    <>
      <PageHeading
        eyebrow="OUR STORY, JUST BEGINNING"
        title={
          <>
            Rooted in art.
            <br />
            <em>Made for you.</em>
          </>
        }
      >
        Henna & Beauty is being shaped for Minnesota’s Somali community,
        celebrating henna artistry, modest styling, and personal expression.
      </PageHeading>
      <section className="about-manifesto container">
        <Flower2 size={70} strokeWidth={0.7} />
        <h2>
          We believe beauty lives
          <br />
          in the <em>personal touches.</em>
        </h2>
        <p>
          In a pattern chosen for a special day. In a style that feels like you.
          In the quiet pleasure of taking a little time for yourself.
        </p>
        <p>
          Our vision is to create a warm, thoughtful salon experience that
          celebrates those moments. The official salon name, founder story,
          team, and location will be added once confirmed.
        </p>
      </section>
      <section className="principles container">
        {[
          [
            Flower2,
            "Artistry",
            "A vision inspired by expressive henna traditions and considered detail.",
          ],
          [
            Heart,
            "Warmth",
            "A welcoming atmosphere where individual preferences guide the experience.",
          ],
          [
            Sparkles,
            "Care",
            "Time and attention for the little things that make a visit feel personal.",
          ],
        ].map(([Icon, title, body]) => (
          <article key={title}>
            <Icon strokeWidth={1} />
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>
      <VisitCTA />
    </>
  );
}
