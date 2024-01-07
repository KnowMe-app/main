
import { Container,} from './Home.styled';
import { termsAndConditions } from './termsAndConditions';

export default function Home({ language }) {
  return (
    <Container>
      <div>
        {termsAndConditions.map((term, index) => (
          <div key={index}>
            <p>{language ? term[language] : term.en}</p>
          </div>
        ))}
      </div>
    </Container>
  );
}
