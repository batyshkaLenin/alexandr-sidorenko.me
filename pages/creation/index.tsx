import { NextPage } from 'next'
import Helmet from "../../components/Helmet";

export const config = { amp: 'hybrid' }

const CreationPage: NextPage = () => (<>
    <Helmet title='Творчество Александра Сидоренко' />
    <div>Страница находится в разработке</div>
</>)

export default CreationPage
