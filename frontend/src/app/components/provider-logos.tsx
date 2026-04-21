import qianwenLogo from "../../assets/f98da2fc5b4bdadc8b64fd24048883767a188e06.png";
import googleLogo from "../../assets/b9a0bb522619fbd222ec5b593794e1f02c640969.png";
import zhipuLogo from "../../assets/e44ced23f37c2a69ae3d9dd18d87d47040deb3e5.png";
import deepseekLogo from "../../assets/f20b98b72f3b691b607f072e48fad598743e4130.png";
import baaiLogo from "../../assets/5a757d8d3f4e420c195aa458f3eff194479ab3a2.png";

export const providerLogos: Record<string, string> = {
  "通义千问": qianwenLogo,
  "Google": googleLogo,
  "智谱AI": zhipuLogo,
  "DeepSeek": deepseekLogo,
  "BAAI": baaiLogo,
};

interface ProviderIconProps {
  provider: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  xs: "w-4 h-4",
  sm: "w-5 h-5",
  md: "w-7 h-7",
  lg: "w-9 h-9",
};

export function ProviderIcon({ provider, size = "sm", className = "" }: ProviderIconProps) {
  const logo = providerLogos[provider];
  const sizeClass = sizeMap[size];

  if (logo) {
    return (
      <img
        src={logo}
        alt={provider}
        className={`${sizeClass} object-contain rounded ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded bg-gray-100 text-gray-500 flex items-center justify-center text-[9px] shrink-0 ${className}`}
      style={{ fontWeight: 700 }}
    >
      {provider[0]}
    </div>
  );
}
