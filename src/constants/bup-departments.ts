/**
 * Bangladesh University of Professionals (BUP) - Academic Departmental Structure
 * Scraped and standardized from the official BUP portal (bup.edu.bd)
 */

export interface DepartmentOption {
  code: string;
  name: string;
  faculty: string;
}

export const BUP_DEPARTMENTS: DepartmentOption[] = [
  // 1. Faculty of Business Studies (FBS)
  { code: 'FBS_MKT', name: 'Department of Business Administration in Marketing', faculty: 'Faculty of Business Studies (FBS)' },
  { code: 'FBS_FIN', name: 'Department of Business Administration in Finance & Banking', faculty: 'Faculty of Business Studies (FBS)' },
  { code: 'FBS_AIS', name: 'Department of Business Administration in Accounting & Information Systems', faculty: 'Faculty of Business Studies (FBS)' },
  { code: 'FBS_MGT', name: 'Department of Business Administration in Management Studies', faculty: 'Faculty of Business Studies (FBS)' },
  { code: 'FBS_GEN', name: 'Department of Business Administration - General (BBA General)', faculty: 'Faculty of Business Studies (FBS)' },

  // 2. Faculty of Arts & Social Sciences (FASS)
  { code: 'FASS_ECON', name: 'Department of Economics', faculty: 'Faculty of Arts & Social Sciences (FASS)' },
  { code: 'FASS_ENG', name: 'Department of English', faculty: 'Faculty of Arts & Social Sciences (FASS)' },
  { code: 'FASS_PAD', name: 'Department of Public Administration', faculty: 'Faculty of Arts & Social Sciences (FASS)' },
  { code: 'FASS_DS', name: 'Department of Development Studies', faculty: 'Faculty of Arts & Social Sciences (FASS)' },
  { code: 'FASS_SOC', name: 'Department of Sociology', faculty: 'Faculty of Arts & Social Sciences (FASS)' },
  { code: 'FASS_DMR', name: 'Department of Disaster Management & Resilience', faculty: 'Faculty of Arts & Social Sciences (FASS)' },
  { code: 'FASS_BABSS', name: 'Department of BA/BSS', faculty: 'Faculty of Arts & Social Sciences (FASS)' },

  // 3. Faculty of Security & Strategic Studies (FSSS)
  { code: 'FSSS_IR', name: 'Department of International Relations', faculty: 'Faculty of Security & Strategic Studies (FSSS)' },
  { code: 'FSSS_LAW', name: 'Department of Law', faculty: 'Faculty of Security & Strategic Studies (FSSS)' },
  { code: 'FSSS_PCHR', name: 'Department of Peace, Conflict and Human Rights', faculty: 'Faculty of Security & Strategic Studies (FSSS)' },
  { code: 'FSSS_MCJ', name: 'Department of Mass Communication and Journalism', faculty: 'Faculty of Security & Strategic Studies (FSSS)' },

  // 4. Faculty of Science & Technology (FST)
  { code: 'FST_CSE', name: 'Department of Computer Science and Engineering (CSE)', faculty: 'Faculty of Science & Technology (FST)' },
  { code: 'FST_ICT', name: 'Department of Information and Communication Technology (ICT/ICE)', faculty: 'Faculty of Science & Technology (FST)' },
  { code: 'FST_ES', name: 'Department of Environmental Science', faculty: 'Faculty of Science & Technology (FST)' },

  // 5. Faculty of Medical Studies (FMS)
  { code: 'FMS_PHARM', name: 'Department of Pharmacy', faculty: 'Faculty of Medical Studies (FMS)' },
  { code: 'FMS_PHI', name: 'Department of Public Health & Informatics', faculty: 'Faculty of Medical Studies (FMS)' },
  { code: 'FMS_AFFIL', name: 'Affiliated Medical / Nursing Colleges (AFMC/AMC)', faculty: 'Faculty of Medical Studies (FMS)' },

  // 6. Centres & Advanced Studies
  { code: 'CML', name: 'Centre for Modern Languages (CML)', faculty: 'Centres & Advanced Studies' },
  { code: 'CHSR', name: 'Centre for Higher Studies and Research (CHSR - MPhil/PhD)', faculty: 'Centres & Advanced Studies' },
  { code: 'BUP_RC', name: 'BUP Research Centre', faculty: 'Centres & Advanced Studies' },

  // 7. General & Support
  { code: 'STAFF', name: 'Hall Staff / Dining Management', faculty: 'Administration & Staff' },
  { code: 'OTHER', name: 'Other', faculty: 'Administration & Staff' }
];

/**
 * Unique list of faculties preserving official ordering
 */
export const BUP_FACULTIES: string[] = Array.from(
  new Set(BUP_DEPARTMENTS.map((dept) => dept.faculty))
);

/**
 * Grouped map of departments by faculty for <optgroup> rendering
 */
export const BUP_DEPARTMENTS_BY_FACULTY: Record<string, DepartmentOption[]> = BUP_DEPARTMENTS.reduce<
  Record<string, DepartmentOption[]>
>((acc, dept) => {
  if (!acc[dept.faculty]) {
    acc[dept.faculty] = [];
  }
  acc[dept.faculty].push(dept);
  return acc;
}, {});
