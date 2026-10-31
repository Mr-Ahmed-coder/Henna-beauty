import { PageHeading, VisitCTA } from "../components/Shared";
import { services } from "../data/services";
export default function Services() {
  return (
    <>
      <PageHeading
        eyebrow="THE BEAUTY MENU"
        title={
          <>
            Find your kind of <em>beautiful.</em>
          </>
        }
      >
        A considered collection of proposed services, from meaningful
        celebrations to everyday self-care.
      </PageHeading>
      <div className="notice container">
        Preview menu · Services, availability, duration, and pricing are
        awaiting confirmation.
      </div>
      <section className="container service-details">
        {services.map((service, index) => (
          <article className="service-detail" key={service.number}>
            <img src={service.image} alt={service.alt} />
            <div>
              <p className="eyebrow">
                {service.number} / {service.tag}
              </p>
              <h2>{service.name}</h2>
              <p>{service.description}</p>
              <ul>
                {[
                  [
                    "Bridal & occasion henna",
                    "Delicate hand designs",
                    "Personalized pattern consultations",
                  ],
                  [
                    "Occasion hairstyling",
                    "Everyday styling",
                    "Hair care consultations",
                  ],
                  [
                    "Occasion makeup",
                    "Manicure & nail care",
                    "Personal beauty consultations",
                  ],
                ][index].map((item) => (
                  <li key={item}>
                    {item}
                    <span>Proposed</span>
                  </li>
                ))}
              </ul>
              <p className="fine-print">
                Illustrative service options and imagery. Prices to be
                announced.
              </p>
            </div>
          </article>
        ))}
      </section>
      <VisitCTA />
    </>
  );
}
