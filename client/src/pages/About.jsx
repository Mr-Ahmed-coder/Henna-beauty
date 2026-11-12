import { PageHeading, VisitCTA } from "../components/Shared";

export default function About() {
  return (
    <>
      <PageHeading title="About Amallina Beauty Salon">
        Dedicated beauty, hair styling, and henna artistry in Minneapolis, Minnesota.
      </PageHeading>
      <section className="about-copy container">
        <h2>A welcoming experience tailored to you</h2>
        <p>
          Welcome to Amallina Beauty Salon. We are dedicated to providing elegant henna designs, beauty treatments, and personalized styling in a welcoming, comfortable, and respectful environment.
        </p>
        <p>
          Conveniently located at 2910 Pillsbury Ave in Minneapolis, we take pride in celebrating community beauty traditions with modern care and exceptional attention to detail.
        </p>
        <p>
          Whether preparing for a wedding, family celebration, or routine self-care, our artists and staff are here for you. Schedule your appointment online in advance or join our daily virtual queue for walk-ins.
        </p>
      </section>
      <VisitCTA />
    </>
  );
}
