import { useState } from 'preact/hooks'
import './app.css'
import { Fragment } from 'preact/jsx-runtime'
import { Button } from '@/components/ui/button'

export function App() {
  const [count, setCount] = useState(0)

  return (
    <Fragment>
      <Button>Click Me</Button>
    </Fragment>
  )
}
