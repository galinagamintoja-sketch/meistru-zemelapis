import Image from "next/image";

type Props = {
  iconOnly?: boolean;
  priority?: boolean;
  className?: string;
};

export default function LocalProBrand({ iconOnly = false, priority = false, className = "" }: Props) {
  return (
    <Image
      className={`localpro-brand ${iconOnly ? "localpro-brand-icon" : "localpro-brand-lockup"} ${className}`.trim()}
      src={iconOnly ? "/brand/localpro-icon.png" : "/brand/localpro-logo.png"}
      alt="LocalPro.lt"
      width={iconOnly ? 72 : 96}
      height={iconOnly ? 72 : 96}
      priority={priority}
    />
  );
}
