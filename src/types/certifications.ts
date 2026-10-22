export interface CertificationExam {
  code: string;
  status: string;
  note?: string;
}

export interface CertificationSelectionReference {
  type: 'resource' | 'blog';
  id: string;
  examCode: string;
  purpose: string;
  scope: string;
  reviewedAt: string;
  reviewedUrl?: string;
  language?: string;
  access?: string;
}

export type ResolvedCertificationSelection = Omit<CertificationSelectionReference, 'reviewedUrl'> & {
  title: string;
  href: string;
};

export interface CertificationPageContent {
  path: string;
  title: string;
  description: string;
  intro: string;
  exam: {
    code: string;
    experience: string;
    requirements: string;
    duration: string;
    questions: string;
    price: string;
    languages: string;
    validity: string;
    passingScore: string;
    guideUrl: string;
  };
  domains: Array<{ name: string; weight: number }>;
  preparation: Array<{ title: string; body: string }>;
  officialPreparation: Array<{ title: string; href: string; note: string }>;
  selections: CertificationSelectionReference[];
  faq: {
    id: string;
    heading: string;
    items: Array<{
      question: string;
      answer: string;
      links?: Array<{ label: string; href: string }>;
    }>;
  };
  library: { group: string; label: string };
  sources?: Array<{ label: string; href: string }>;
}

export interface CertificationPage extends CertificationPageContent {
  id: string;
  name: string;
  category: string;
  officialUrl: string;
  reviewedAt: string;
}

export type ResolvedCertificationPage = Omit<CertificationPage, 'selections'> & {
  selections: ResolvedCertificationSelection[];
};

export interface CertificationRecord {
  id: string;
  name: string;
  category: string;
  purpose: string;
  officialUrl: string;
  reviewedAt: string;
  exams: CertificationExam[];
  page?: CertificationPageContent;
}
