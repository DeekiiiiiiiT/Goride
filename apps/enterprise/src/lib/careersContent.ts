export const CAREERS_EMAIL = 'careers@roamenterprise.co';
export const TALENT_NETWORK_EMAIL = 'talent@roamenterprise.co';

export const WHY_ROAM = [
  {
    title: 'Collaborative & Innovative',
    description:
      'We believe in systematic problem solving. Our teams operate with radical transparency to build the most efficient mobility tech on the market.',
    icon: 'collaborative' as const,
  },
  {
    title: 'Health & Equity',
    description:
      'Comprehensive medical, dental, and vision coverage, alongside competitive equity packages that grow with our success.',
    icon: 'health' as const,
  },
  {
    title: 'Growth Opportunities',
    description:
      'Personal development budgets and dedicated mentorship tracks for every single employee, from junior engineers to senior leads.',
    icon: 'growth' as const,
  },
  {
    title: 'Remote & Hybrid',
    description:
      'Work from where you move best. We offer flexible arrangements to support our global talent network.',
    icon: 'remote' as const,
  },
] as const;

export const DEPARTMENTS = [
  { name: 'Engineering', icon: 'engineering' as const, accent: 'dash-cyan' as const },
  { name: 'Product', icon: 'product' as const, accent: 'secondary-container' as const },
  { name: 'Operations', icon: 'operations' as const, accent: 'secondary-fixed-dim' as const },
  { name: 'Marketing', icon: 'marketing' as const, accent: 'rides-blue' as const },
  { name: 'Customer Support', icon: 'support' as const, accent: 'error-container' as const },
] as const;

export type JobListing = {
  id: string;
  title: string;
  location: string;
  department: string;
};

export const JOB_LISTINGS: JobListing[] = [
  { id: '1', title: 'Senior Backend Engineer', location: 'Remote', department: 'Engineering' },
  { id: '2', title: 'Product Designer', location: 'London, UK', department: 'Product' },
  { id: '3', title: 'Operations Manager', location: 'New York, NY', department: 'Operations' },
  { id: '4', title: 'Growth Marketing Lead', location: 'Remote', department: 'Marketing' },
  { id: '5', title: 'Frontend Engineer', location: 'Remote', department: 'Engineering' },
  { id: '6', title: 'Product Manager', location: 'San Francisco, CA', department: 'Product' },
  { id: '7', title: 'Customer Success Lead', location: 'Remote', department: 'Customer Support' },
  { id: '8', title: 'DevOps Engineer', location: 'Remote', department: 'Engineering' },
];

export const DEPARTMENT_FILTER_OPTIONS = [
  'All Departments',
  'Engineering',
  'Product',
  'Operations',
  'Marketing',
  'Customer Support',
] as const;
