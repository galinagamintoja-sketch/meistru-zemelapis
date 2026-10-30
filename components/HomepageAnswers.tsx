import Link from "next/link";
import { homepageJsonLd, safeJsonLd } from "../lib/seo";

/** Server-rendered answers and platform identity; mount once on the homepage. */
export default function HomepageAnswers() {
  return <section className="public-profile-shell" aria-labelledby="homepage-answers-title">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(homepageJsonLd()) }} />
    <div className="public-profile-card">
      <h2 id="homepage-answers-title">Kaip veikia LocalPro.lt?</h2>
      <p>LocalPro.lt – meistrų paieškos ir darbų užklausų platforma Lietuvoje. Čia galite peržiūrėti specialistų paslaugas ir aptarnaujamas vietoves.</p>
      <h3>Kaip rasti meistrą savo vietovėje?</h3>
      <p>Paieškoje pasirinkite reikalingą paslaugą ir vietovę. Peržiūrėkite rastų specialistų profilius, paslaugų aprašymus ir pateiktas darbų nuotraukas.</p>
      <h3>Kaip susisiekti ir aptarti darbų kainą?</h3>
      <p>Specialisto profilyje rasite jo viešai pateiktus susisiekimo būdus. Darbų apimtį, kainą ir terminus aptarkite tiesiogiai su pasirinktu specialistu.</p>
      <h3>Kur aprašyti reikalingą darbą?</h3>
      <p><Link href="/request">Pateikite darbų užklausą</Link>: pasirinkite darbo sritį, nurodykite darbo vietą ir aprašykite, ką reikia atlikti. Užklausa ir pridėtos nuotraukos nėra viešinamos; užklausą pirmiausia peržiūri LocalPro administratorius.</p>
      <h3>Kur meistrams rasti darbų skelbimus?</h3>
      <p><Link href="/darbu-skelbimai">Darbų skelbimų puslapyje</Link> galima ieškoti viešų užsakymų pagal amatą ir vietovę. Norėdami pristatyti savo paslaugas, pradėkite nuo <Link href="/meistro-registracija">meistro registracijos</Link>.</p>
    </div>
  </section>;
}
