import Image from "next/image";

const INK = "#1e2b18";
const RAISED = "#fdfaf5";

/**
 * A print in a frame: dark moulding, cream mat, artwork. The artwork files carry
 * their own drawn border, so the mat is what stops that border reading as the frame.
 */
export default function FramedPrint({
  src,
  alt,
  matPadding,
  frameWidth = "12px",
  priority = false,
}: {
  src: string;
  alt: string;
  matPadding: string;
  frameWidth?: string;
  priority?: boolean;
}) {
  return (
    <div
      style={{
        background: INK,
        padding: frameWidth,
        boxShadow:
          "0 30px 60px -24px rgba(30,43,24,0.4), 0 3px 10px rgba(30,43,24,0.1)",
      }}
    >
      <div style={{ background: RAISED, padding: matPadding }}>
        <Image
          src={src}
          alt={alt}
          width={400}
          height={520}
          unoptimized
          priority={priority}
          className="block h-auto w-full"
        />
      </div>
    </div>
  );
}
