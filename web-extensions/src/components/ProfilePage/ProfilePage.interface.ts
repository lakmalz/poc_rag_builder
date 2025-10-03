import { TDSButtonProps } from "@underdog-dev/ui";

export type Gender = "Male" | "Female" | "Other";

type ButtonSize = TDSButtonProps["size"];
type ButtonVariant = TDSButtonProps["variant"];
type ButtonColor = TDSButtonProps["color"];

interface ButtonSettings {
  label: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  color?: ButtonColor;
  disabled?: boolean;
  action?: () => void;
}

export interface UserProfile {
  name?: string;
  picture?: string;
  gender?: Gender;
  address?: string;
  country?: string;
  telephone?: string;
}



export interface ProfilePageProps {
  user: UserProfile;
  onAccept?: (form: UserProfile) => void;
  onEdit?: () => void;
  button1Settings?: ButtonSettings;
  button2Settings?: ButtonSettings;
}