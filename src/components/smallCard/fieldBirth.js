import { utilCalculateAge } from "./utilCalculateAge";

export const fieldBirth = birth => {
  const age = utilCalculateAge(birth);

  return age !== null ? <span>{age}р</span> : null;
};
