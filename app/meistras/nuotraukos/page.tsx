import { PortalCard } from "../../../components/tradesperson-shell";
import { PhotoUploader } from "../../../components/photo-uploader";
export default function Page() { return <div className="portal-page"><div className="portal-heading"><h1>Nuotraukos</h1><p>Naujos ir pakeistos nuotraukos viešinamos tik administratoriui patvirtinus.</p></div><PortalCard title="Darbų nuotraukos"><span className="status-badge status-warning">Reikalingas patvirtinimas</span><PhotoUploader /></PortalCard></div>; }
